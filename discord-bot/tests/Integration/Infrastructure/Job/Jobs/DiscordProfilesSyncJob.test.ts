import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../src/Infrastructure/DependencyInjection/types';
import DatabaseUtil from '../../../../Helper/DatabaseUtil';
import { createAd, createScreenshot } from '../../../../Helper/StaticFixtures';
import { DiscordProfilesSyncJob } from '../../../../../src/Infrastructure/Job/Jobs/DiscordProfilesSyncJob.ts';
import type { DiscordProfileRepository } from '../../../../../src/Domain/Profile/DiscordProfileRepository.ts';
import { DiscordProfile } from '../../../../../src/Domain/Profile/DiscordProfile.ts';
import type { GuildClient } from '../../../../../src/Domain/Community/GuildClient.ts';
import { InMemoryGuildClient } from '../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import { AdId } from '../../../../../src/Domain/Marketplace/AdId.ts';

const AUTHOR_A = '111111111111111111';
const AUTHOR_B = '222222222222222222';

/**
 * M10.4 — the job that makes crediting possible at all: without a row per
 * author, `screenshots.author_id` joins to nothing and the portal has only a
 * snowflake it is not allowed to publish.
 *
 * Driven through the container (rather than a hand-built handler, as
 * SyncDiscordProfileHandler's own test does) precisely because the wiring is
 * part of what is being tested — cross-cutting rule 6: a job that is not
 * bound does not exist.
 */
describe('DiscordProfilesSyncJob Integration Test', () => {
    let job: DiscordProfilesSyncJob;
    let repository: DiscordProfileRepository;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        job = myContainer.get(DiscordProfilesSyncJob);
        repository = myContainer.get<DiscordProfileRepository>(TYPES.DiscordProfileRepository);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    const context = (overrides: Partial<{ dryRun: boolean; workLimit: number }> = {}) => ({
        dryRun: overrides.dryRun ?? false,
        workLimit: overrides.workLimit ?? 50,
    });

    test('caches a name for every distinct author across screenshots and ads', async () => {
        await createScreenshot(undefined, 'One', AUTHOR_A);
        await createScreenshot(undefined, 'Two', AUTHOR_A); // same person, two screenshots
        await createAd(AdId.generate(), 'An ad', AUTHOR_B);

        guildClient.registerUser({
            id: AUTHOR_A,
            username: 'author-a',
            displayName: null,
            avatarHash: null,
        });
        guildClient.registerUser({
            id: AUTHOR_B,
            username: 'author-b',
            displayName: null,
            avatarHash: null,
        });

        const result = await job.run(context());

        // Two people, not three rows — 624 screenshots from 83 authors is 83
        // Discord calls, which is the whole point of the UNION query.
        expect(result.considered).toBe(2);
        expect(result.changed).toBe(2);
        expect((await repository.find(AUTHOR_A))?.username).toBe('author-a');
        expect((await repository.find(AUTHOR_B))?.username).toBe('author-b');
    });

    test('a dry run reports the work without writing anything', async () => {
        await createScreenshot(undefined, 'One', AUTHOR_A);
        guildClient.registerUser({
            id: AUTHOR_A,
            username: 'author-a',
            displayName: null,
            avatarHash: null,
        });

        const result = await job.run(context({ dryRun: true }));

        expect(result.considered).toBe(1);
        expect(result.changed).toBe(0);
        expect(await repository.find(AUTHOR_A)).toBeNull();
    });

    test('a freshly-synced profile is left alone on the next run', async () => {
        await createScreenshot(undefined, 'One', AUTHOR_A);
        await repository.save(
            new DiscordProfile(AUTHOR_A, 'already-known', null, null, null, new Date()),
        );

        const result = await job.run(context());

        expect(result.considered).toBe(0);
        expect((await repository.find(AUTHOR_A))?.username).toBe('already-known');
    });

    test('a stale profile is refreshed', async () => {
        await createScreenshot(undefined, 'One', AUTHOR_A);
        const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await repository.save(new DiscordProfile(AUTHOR_A, 'old-name', null, null, null, longAgo));
        guildClient.registerUser({
            id: AUTHOR_A,
            username: 'renamed',
            displayName: null,
            avatarHash: null,
        });

        const result = await job.run(context());

        expect(result.changed).toBe(1);
        expect((await repository.find(AUTHOR_A))?.username).toBe('renamed');
    });

    test('the work limit bounds a run, and never-synced authors come first', async () => {
        await createScreenshot(undefined, 'One', AUTHOR_A);
        await createScreenshot(undefined, 'Two', AUTHOR_B);
        // AUTHOR_B already has a (stale) row; AUTHOR_A has none at all, so a
        // budget of one must be spent on AUTHOR_A.
        await repository.save(
            new DiscordProfile(
                AUTHOR_B,
                'stale-but-present',
                null,
                null,
                null,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            ),
        );
        guildClient.registerUser({
            id: AUTHOR_A,
            username: 'author-a',
            displayName: null,
            avatarHash: null,
        });

        const result = await job.run(context({ workLimit: 1 }));

        expect(result.considered).toBe(1);
        expect((await repository.find(AUTHOR_A))?.username).toBe('author-a');
        expect((await repository.find(AUTHOR_B))?.username).toBe('stale-but-present');
    });

    test('a deleted Discord account is skipped, not counted as a failure', async () => {
        await createScreenshot(undefined, 'One', AUTHOR_A);
        // Nobody registered — fetchUser answers null, the real client's
        // Unknown-User (10013) case.

        const result = await job.run(context());

        expect(result.skipped).toBe(1);
        expect(result.failed).toBe(0);
    });
});
