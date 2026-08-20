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
import { CommunityChannels } from '../../../../../src/Domain/Community/CommunityChannels.ts';
import InMemoryLogger from '../../../../Helper/InMemoryLogger.ts';
import FakeTrophySource from '../../../../Helper/FakeTrophySource.ts';
import DatabaseUtil from '../../../../Helper/DatabaseUtil.ts';
import { createTrophyProfile, createTrophy } from '../../../../Helper/StaticFixtures.ts';

function context(overrides: Partial<JobContext> = {}): JobContext {
    return { dryRun: false, workLimit: 200, ...overrides };
}

/** `TROPHIES_ANNOUNCE_ENABLED=true`, plus any other env overrides a test needs. */
function announceEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return { TROPHIES_ANNOUNCE_ENABLED: 'true', ...overrides } as NodeJS.ProcessEnv;
}

function trophyMessages(guildClient: InMemoryGuildClient): string[] {
    return guildClient.sentMessages
        .filter((sent) => sent.channel === CommunityChannels.TROPHIES)
        .map((sent) => sent.message);
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
    let inMemoryLogger: InMemoryLogger;
    let job: TrophiesSyncJob;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        trophyProfileRepository = myContainer.get<TrophyProfileRepository>(
            TYPES.TrophyProfileRepository,
        );
        trophyRepository = myContainer.get<TrophyRepository>(TYPES.TrophyRepository);
        trophySource = new FakeTrophySource();
        guildClient = new InMemoryGuildClient();
        inMemoryLogger = new InMemoryLogger();
        const logger = new Logger([inMemoryLogger]);

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

    test('the moderation safety valve suppresses a batch larger than the threshold instead of writing it', async () => {
        // 11 profiles all reporting no visible rank — over the threshold
        // (10). This is exactly the failure mode a broken PSNProfiles parser
        // would produce: everyone suddenly looks rank-less at once.
        const profiles = [];
        for (let i = 0; i < 11; i++) {
            const psnProfile = `SafetyValveUser${i}`;
            profiles.push(await createTrophyProfile(undefined, `user-safety-${i}`, psnProfile));
            trophySource.setNoRank(psnProfile);
        }

        const result = await job.run(context());

        expect(result.details?.moderationSafetyValveTripped).toBe(true);
        expect(result.details?.moderationSuppressedCount).toBe(11);
        expect(result.details?.newlyFlagged).toEqual([]);

        // Nothing was actually written — every profile is untouched.
        for (const profile of profiles) {
            const stored = await trophyProfileRepository.get(profile.id);
            expect(stored.isBanned).toBe(false);
            expect(stored.isExcluded).toBe(false);
        }
    });

    test('a batch at or under the threshold is written normally, not suppressed', async () => {
        const profiles = [];
        for (let i = 0; i < 5; i++) {
            const psnProfile = `SmallBatchUser${i}`;
            profiles.push(await createTrophyProfile(undefined, `user-small-${i}`, psnProfile));
            trophySource.setNoRank(psnProfile);
        }

        const result = await job.run(context());

        expect(result.details?.moderationSafetyValveTripped).toBeUndefined();
        expect(result.details?.newlyFlagged).toHaveLength(5);

        for (const profile of profiles) {
            const stored = await trophyProfileRepository.get(profile.id);
            expect(stored.isBanned).toBe(true);
            expect(stored.isExcluded).toBe(true);
        }
    });

    test('a --dry-run still reports what the safety valve would have suppressed, without writing anything', async () => {
        for (let i = 0; i < 11; i++) {
            const psnProfile = `DryRunSafetyValveUser${i}`;
            await createTrophyProfile(undefined, `user-dry-safety-${i}`, psnProfile);
            trophySource.setNoRank(psnProfile);
        }

        const result = await job.run(context({ dryRun: true }));

        expect(result.details?.moderationSafetyValveTripped).toBe(true);
        expect(result.details?.moderationSuppressedCount).toBe(11);
    });

    /**
     * M7.8 — trophy announcements through GuildClient, replacing
     * `TROPHY_WEBHOOK`. See TrophiesSyncJob's "Announcements, and their
     * flood guard" doc comment for the three independent guards these tests
     * cover: the master switch, per-profile batching, and the per-run cap.
     */
    describe('announcements (M7.8)', () => {
        test('are off by default: a new trophy is still created, but nothing is posted', async () => {
            await createTrophyProfile(undefined, 'user-announce-1', 'QuietUser');
            trophySource.setTrophyPages('QuietUser', [['url-quiet']]);
            trophySource.setTrophyData('url-quiet', {
                percentage: 12.3,
                completionDate: new Date(),
            });

            const result = await job.run(context());

            expect(result.changed).toBeGreaterThan(0);
            expect(trophyMessages(guildClient)).toEqual([]);
        });

        test('a --dry-run never announces, even with TROPHIES_ANNOUNCE_ENABLED=true', async () => {
            await createTrophyProfile(undefined, 'user-announce-2', 'DryRunAnnounceUser');
            trophySource.setTrophyPages('DryRunAnnounceUser', [['url-dry-announce']]);
            trophySource.setTrophyData('url-dry-announce', {
                percentage: 12.3,
                completionDate: new Date(),
            });

            await job.run(context({ dryRun: true }), announceEnv());

            expect(trophyMessages(guildClient)).toEqual([]);
        });

        test('a small batch (at or under the threshold) posts one message per trophy', async () => {
            await createTrophyProfile(undefined, 'user-announce-3', 'SmallAnnounceUser');
            trophySource.setTrophyPages('SmallAnnounceUser', [['url-s2', 'url-s1']]);
            trophySource.setTrophyData('url-s1', { percentage: 12.3, completionDate: new Date() });
            trophySource.setTrophyData('url-s2', { percentage: 50, completionDate: new Date() });

            await job.run(context(), announceEnv());

            const messages = trophyMessages(guildClient);
            expect(messages).toHaveLength(2);
            expect(messages).toContainEqual(
                expect.stringContaining(
                    'Parabéns <@user-announce-3>! Acabaste de receber 250 TP (Trophy Points) pelo teu troféu: url-s1',
                ),
            );
            expect(messages).toContainEqual(
                expect.stringContaining(
                    'Parabéns <@user-announce-3>! Acabaste de receber 50 TP (Trophy Points) pelo teu troféu: url-s2',
                ),
            );
        });

        test('flood guard — a backlog above the batch threshold collapses into one summary message, not one per trophy', async () => {
            const psnProfile = 'BacklogUser';
            const profile = await createTrophyProfile(undefined, 'user-announce-4', psnProfile);
            // 4 new trophies > TROPHIES_ANNOUNCE_BATCH_THRESHOLD (3) — the
            // exact "first run against a fresh profile" scenario the guard
            // exists for, just small enough to not also need the run-wide cap.
            const urls = ['url-b1', 'url-b2', 'url-b3', 'url-b4'];
            trophySource.setTrophyPages(psnProfile, [urls]);
            for (const url of urls) {
                trophySource.setTrophyData(url, { percentage: 12.3, completionDate: new Date() });
            }

            const result = await job.run(context(), announceEnv());

            // All 4 trophies were still created...
            const trophies = await trophyRepository.findByProfile(profile.id.toString());
            expect(trophies).toHaveLength(4);

            // ...but exactly one collapsed message was posted, not four.
            const messages = trophyMessages(guildClient);
            expect(messages).toHaveLength(1);
            expect(messages[0]).toContain('Parabéns <@user-announce-4>!');
            expect(messages[0]).toContain('4 troféus novos');
            expect(messages[0]).toContain('1000 TP'); // 4 x 250
            expect(result.details?.announcements).toMatchObject({
                enabled: true,
                sent: 1,
                suppressed: 0,
            });
        });

        test('flood guard — a per-run cap stops posting once spent, without failing the sync', async () => {
            // 12 profiles, one new (non-batched) trophy each: 12 candidate
            // messages against a cap of 10 — simulates re-enabling
            // TROPHIES_ANNOUNCE_ENABLED after profiles had quietly
            // accumulated unannounced trophies while it was off.
            const profileCount = 12;
            for (let i = 0; i < profileCount; i++) {
                const psnProfile = `CapUser${i}`;
                await createTrophyProfile(undefined, `user-cap-${i}`, psnProfile);
                trophySource.setTrophyPages(psnProfile, [[`url-cap-${i}`]]);
                trophySource.setTrophyData(`url-cap-${i}`, {
                    percentage: 12.3,
                    completionDate: new Date(),
                });
            }

            const result = await job.run(context(), announceEnv());

            // Every profile's trophy was still created — the cap only gates
            // the announcement, never the sync itself.
            expect(result.changed).toBeGreaterThanOrEqual(profileCount);
            expect(result.failed).toBe(0);

            const messages = trophyMessages(guildClient);
            expect(messages).toHaveLength(10);
            expect(result.details?.announcements).toMatchObject({
                enabled: true,
                sent: 10,
                suppressed: 2,
            });
            expect(inMemoryLogger.hasLog('warn', 'trophies:sync.announce.suppressed')).toBe(true);
        });

        test('a failed post is logged, but never fails the sync or the profile it belongs to', async () => {
            await createTrophyProfile(undefined, 'user-announce-5', 'FailingAnnounceUser');
            await createTrophyProfile(undefined, 'user-announce-6', 'OtherAnnounceUser');
            trophySource.setTrophyPages('FailingAnnounceUser', [['url-fail-announce']]);
            trophySource.setTrophyPages('OtherAnnounceUser', [['url-ok-announce']]);
            trophySource.setTrophyData('url-fail-announce', {
                percentage: 12.3,
                completionDate: new Date(),
            });
            trophySource.setTrophyData('url-ok-announce', {
                percentage: 12.3,
                completionDate: new Date(),
            });
            // Only the very next sendMessage() call throws — exactly one
            // announcement is affected.
            guildClient.failNextSendWith = new Error('Discord is unreachable');

            const result = await job.run(context(), announceEnv());

            // Neither profile's trophy creation is affected by the send failure.
            expect(result.failed).toBe(0);
            expect(result.changed).toBeGreaterThanOrEqual(2);

            // Exactly one message got through (the other's send failed).
            expect(trophyMessages(guildClient)).toHaveLength(1);
            expect(inMemoryLogger.hasLog('error', 'trophies:sync.announce.failed')).toBe(true);
        });
    });
});
