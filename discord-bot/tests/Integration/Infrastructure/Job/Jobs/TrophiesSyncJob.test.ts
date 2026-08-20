import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../src/Infrastructure/DependencyInjection/inversify.config.ts';
import { TYPES } from '../../../../../src/Infrastructure/DependencyInjection/types.ts';
import type { TrophyProfileRepository } from '../../../../../src/Domain/Trophy/TrophyProfileRepository.ts';
import type { TrophyRepository } from '../../../../../src/Domain/Trophy/TrophyRepository.ts';
import { TrophiesSyncJob } from '../../../../../src/Infrastructure/Job/Jobs/TrophiesSyncJob.ts';
import { TrophyNotEarnedYet } from '../../../../../src/Domain/Trophy/TrophyNotEarnedYet.ts';
import Logger from '../../../../../src/Application/Logger/Logger.ts';
import type { JobContext } from '../../../../../src/Domain/Job/Job.ts';
import { InMemoryGuildClient } from '../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import InMemoryLogger from '../../../../Helper/InMemoryLogger.ts';
import FakeTrophySource from '../../../../Helper/FakeTrophySource.ts';
import DatabaseUtil from '../../../../Helper/DatabaseUtil.ts';
import { createTrophyProfile, createTrophy } from '../../../../Helper/StaticFixtures.ts';

function context(overrides: Partial<JobContext> = {}): JobContext {
    return { dryRun: false, workLimit: 200, ...overrides };
}

/**
 * M7.3 — the data-producing side of `/trophy rank`. Built by hand with a
 * `FakeTrophySource` and a fresh `InMemoryGuildClient` (no test may hit the
 * network, real PSNProfiles or real Discord); the profile/trophy
 * repositories are the real, DB-backed ones from the container, since the
 * whole point of this job is what it writes.
 */
describe('TrophiesSyncJob', () => {
    let trophyProfileRepository: TrophyProfileRepository;
    let trophyRepository: TrophyRepository;
    let trophySource: FakeTrophySource;
    let guildClient: InMemoryGuildClient;
    let job: TrophiesSyncJob;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        trophyProfileRepository = myContainer.get<TrophyProfileRepository>(
            TYPES.TrophyProfileRepository,
        );
        trophyRepository = myContainer.get<TrophyRepository>(TYPES.TrophyRepository);
        trophySource = new FakeTrophySource();
        guildClient = new InMemoryGuildClient();
        const logger = new Logger([new InMemoryLogger()]);

        job = new TrophiesSyncJob(
            trophyProfileRepository,
            trophyRepository,
            trophySource,
            guildClient,
            logger,
        );

        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('exposes a stable name and the every-10-minutes schedule', () => {
        expect(job.name).toBe('trophies:sync');
        expect(job.schedule).toBe('*/10 * * * *');
    });

    test('catch-up mode: creates newer trophies and stops at the first already-claimed one', async () => {
        const profile = await createTrophyProfile(undefined, 'user-1', 'CatchUpUser');
        // Pre-existing claim: this profile already has url-2.
        await createTrophy(undefined, profile, 'url-2', 100, new Date());

        // Newest-first: url-3 is new, url-2 is already claimed, url-1 would
        // be new too but must never be reached.
        trophySource.setTrophyPages('CatchUpUser', [['url-3', 'url-2', 'url-1']]);
        trophySource.setTrophyData('url-3', { percentage: 12.3, completionDate: new Date() });
        trophySource.setTrophyData('url-1', { percentage: 50, completionDate: new Date() });

        const result = await job.run(context());

        expect(result.failed).toBe(0);
        expect(trophySource.trophyDataRequests).toContain('url-3');
        expect(trophySource.trophyDataRequests).not.toContain('url-1');

        const trophies = await trophyRepository.findByProfile(profile.id.toString());
        expect(trophies.map((t) => t.url).sort()).toEqual(['url-2', 'url-3']);
    });

    test('--dry-run writes nothing: no trophy rows, no flag changes', async () => {
        const profile = await createTrophyProfile(undefined, 'user-2', 'DryRunUser');
        trophySource.setTrophyPages('DryRunUser', [['url-a']]);
        trophySource.setTrophyData('url-a', { percentage: 12.3, completionDate: new Date() });

        const result = await job.run(context({ dryRun: true }));

        expect(result.changed).toBeGreaterThan(0); // it *would* have changed something...
        const trophies = await trophyRepository.findByProfile(profile.id.toString());
        expect(trophies).toEqual([]); // ...but nothing was actually written.

        const stored = await trophyProfileRepository.get(profile.id);
        expect(stored.isBanned).toBe(false);
        expect(stored.isExcluded).toBe(false);
    });

    test('a --dry-run flag change is also not written', async () => {
        const profile = await createTrophyProfile(undefined, 'user-3', 'DryRunBannedUser');
        trophySource.setNoRank('DryRunBannedUser');

        await job.run(context({ dryRun: true }));

        const stored = await trophyProfileRepository.get(profile.id);
        expect(stored.isBanned).toBe(false);
        expect(stored.isExcluded).toBe(false);
    });

    test('respects the work limit: later profiles are skipped, not silently dropped', async () => {
        const first = await createTrophyProfile(undefined, 'user-4', 'FirstUser');
        await createTrophyProfile(undefined, 'user-5', 'SecondUser');
        trophySource.setTrophyPages('FirstUser', [['url-x']]);
        trophySource.setTrophyPages('SecondUser', [['url-y']]);
        trophySource.setTrophyData('url-x', { percentage: 12.3, completionDate: new Date() });
        trophySource.setTrophyData('url-y', { percentage: 12.3, completionDate: new Date() });

        // Budget: rank(1) + membership(1) + page-fetch(1) = 3 exactly
        // exhausts the budget for FirstUser, before any trophy detail
        // fetch — SecondUser must never even be considered.
        const result = await job.run(context({ workLimit: 3 }));

        expect(result.considered).toBe(1);
        expect(result.skipped).toBeGreaterThanOrEqual(1);
        expect(trophySource.trophyDataRequests).toEqual([]);

        const firstTrophies = await trophyRepository.findByProfile(first.id.toString());
        expect(firstTrophies).toEqual([]);
    });

    test('no visible rank flags isBanned + isExcluded, and skips the membership/trophy checks', async () => {
        const profile = await createTrophyProfile(undefined, 'user-6', 'BannedUser');
        trophySource.setNoRank('BannedUser');

        const result = await job.run(context());

        const stored = await trophyProfileRepository.get(profile.id);
        expect(stored.isBanned).toBe(true);
        expect(stored.isExcluded).toBe(true);
        expect(stored.hasLeft).toBe(false);

        expect(result.details?.newlyFlagged).toEqual([
            { psnProfile: 'BannedUser', flag: expect.stringContaining('isBanned') },
        ]);

        // Never got as far as checking membership or walking trophies.
        expect(trophySource.trophyListRequests).toEqual([]);
    });

    test('Discord error 10007 (no longer a guild member) flags hasLeft + isExcluded', async () => {
        const profile = await createTrophyProfile(undefined, 'user-7', 'LeftUser');
        guildClient.markMemberLeft('user-7');

        const result = await job.run(context());

        const stored = await trophyProfileRepository.get(profile.id);
        expect(stored.hasLeft).toBe(true);
        expect(stored.isExcluded).toBe(true);
        expect(stored.isBanned).toBe(false);

        expect(result.details?.newlyFlagged).toEqual([
            { psnProfile: 'LeftUser', flag: expect.stringContaining('hasLeft') },
        ]);
        expect(trophySource.trophyListRequests).toEqual([]);
    });

    test('a profile whose rank lookup throws is counted failed, and the run continues to the next profile', async () => {
        await createTrophyProfile(undefined, 'user-8', 'ThrowingUser');
        const goodProfile = await createTrophyProfile(undefined, 'user-9', 'GoodUser');
        trophySource.failRankWith('ThrowingUser', new Error('PSNProfiles is down'));
        trophySource.setTrophyPages('GoodUser', [['url-good']]);
        trophySource.setTrophyData('url-good', { percentage: 12.3, completionDate: new Date() });

        const result = await job.run(context());

        expect(result.failed).toBe(1);
        expect(result.details?.failedProfiles).toEqual([
            { psnProfile: 'ThrowingUser', reason: 'PSNProfiles is down' },
        ]);

        // GoodUser was still processed despite ThrowingUser's failure.
        const goodTrophies = await trophyRepository.findByProfile(goodProfile.id.toString());
        expect(goodTrophies.map((t) => t.url)).toEqual(['url-good']);
    });

    test('a trophy not earned yet is skipped, not treated as a failure, and the walk continues', async () => {
        const profile = await createTrophyProfile(undefined, 'user-10', 'NotEarnedUser');
        trophySource.setTrophyPages('NotEarnedUser', [['url-not-earned', 'url-earned']]);
        trophySource.failTrophyDataWith('url-not-earned', new TrophyNotEarnedYet('url-not-earned'));
        trophySource.setTrophyData('url-earned', { percentage: 12.3, completionDate: new Date() });

        const result = await job.run(context());

        expect(result.failed).toBe(0);
        expect(result.skipped).toBeGreaterThanOrEqual(1);
        const trophies = await trophyRepository.findByProfile(profile.id.toString());
        expect(trophies.map((t) => t.url)).toEqual(['url-earned']);
    });

    test('full re-scan override (TROPHIES_SYNC_ALL + TROPHIES_SYNC_PROFILE) skips past an already-claimed trophy instead of stopping', async () => {
        const profile = await createTrophyProfile(undefined, 'user-11', 'FullRescanUser');
        await createTrophyProfile(undefined, 'user-12', 'OtherUser');
        await createTrophy(undefined, profile, 'url-old', 100, new Date());

        trophySource.setTrophyPages('FullRescanUser', [['url-new1', 'url-old', 'url-new2']]);
        trophySource.setTrophyData('url-new1', { percentage: 12.3, completionDate: new Date() });
        trophySource.setTrophyData('url-new2', { percentage: 50, completionDate: new Date() });

        const result = await job.run(context(), {
            TROPHIES_SYNC_ALL: 'true',
            TROPHIES_SYNC_PROFILE: 'FullRescanUser',
        } as NodeJS.ProcessEnv);

        // Only the targeted profile was considered — OtherUser is filtered out.
        expect(result.considered).toBe(1);
        expect(trophySource.trophyDataRequests).toContain('url-new2');

        const trophies = await trophyRepository.findByProfile(profile.id.toString());
        expect(trophies.map((t) => t.url).sort()).toEqual(['url-new1', 'url-new2', 'url-old']);
    });

    test('TROPHIES_SYNC_ALL without TROPHIES_SYNC_PROFILE is rejected without touching any profile', async () => {
        await createTrophyProfile(undefined, 'user-13', 'SomeUser');

        const result = await job.run(context(), { TROPHIES_SYNC_ALL: 'true' } as NodeJS.ProcessEnv);

        expect(result.considered).toBe(0);
        expect(result.details?.error).toContain('TROPHIES_SYNC_PROFILE');
        expect(trophySource.rankRequests).toEqual([]);
    });

    test('an excluded profile is never considered at all', async () => {
        await createTrophyProfile(undefined, 'user-14', 'ExcludedUser', false, false, true);

        const result = await job.run(context());

        expect(result.considered).toBe(0);
        expect(trophySource.rankRequests).toEqual([]);
    });
});
