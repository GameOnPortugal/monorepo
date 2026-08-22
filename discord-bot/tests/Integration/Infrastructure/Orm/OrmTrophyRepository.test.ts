import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { TrophyRepository } from '../../../../src/Domain/Trophy/TrophyRepository';
import { TrophyAlreadyClaimed } from '../../../../src/Domain/Trophy/TrophyAlreadyClaimed';
import { Trophy } from '../../../../src/Domain/Trophy/Trophy';
import { TrophyId } from '../../../../src/Domain/Trophy/TrophyId';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createTrophyProfile, createTrophy } from '../../../Helper/StaticFixtures';

describe('OrmTrophyRepository Integration Test', () => {
    let trophyRepository: TrophyRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        trophyRepository = myContainer.get<TrophyRepository>(TYPES.TrophyRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('getTopLifetimeHunters returns the true top N in points order, regardless of insertion order', async () => {
        // Arrange — insert profiles so the highest scorers come LAST. If the
        // repository truncated with `take` before summing/sorting (the bug),
        // the best profiles inserted after the limit would never appear.
        const low1 = await createTrophyProfile(undefined, 'user-low-1', 'Low1');
        await createTrophy(undefined, low1.id.toString(), undefined, 10);

        const low2 = await createTrophyProfile(undefined, 'user-low-2', 'Low2');
        await createTrophy(undefined, low2.id.toString(), undefined, 20);

        const low3 = await createTrophyProfile(undefined, 'user-low-3', 'Low3');
        await createTrophy(undefined, low3.id.toString(), undefined, 30);

        const low4 = await createTrophyProfile(undefined, 'user-low-4', 'Low4');
        await createTrophy(undefined, low4.id.toString(), undefined, 40);

        // These are inserted LAST but score highest — they must still win.
        const top1 = await createTrophyProfile(undefined, 'user-top-1', 'Top1');
        await createTrophy(undefined, top1.id.toString(), undefined, 500);

        const top2 = await createTrophyProfile(undefined, 'user-top-2', 'Top2');
        await createTrophy(undefined, top2.id.toString(), undefined, 300);

        // Act
        const result = await trophyRepository.getTopLifetimeHunters(3);

        // Assert
        expect(result).toHaveLength(3);
        expect(result[0]?.userId).toBe('user-top-1');
        expect(result[0]?.points).toBe(500);
        expect(result[1]?.userId).toBe('user-top-2');
        expect(result[1]?.points).toBe(300);
        expect(result[2]?.userId).toBe('user-low-4');
        expect(result[2]?.points).toBe(40);
    });

    test('getTopSinceCreationHunters returns the true top N in points order, regardless of insertion order', async () => {
        const low = await createTrophyProfile(undefined, 'user-low', 'Low');
        await createTrophy(undefined, low.id.toString(), undefined, 5);

        const mid = await createTrophyProfile(undefined, 'user-mid', 'Mid');
        await createTrophy(undefined, mid.id.toString(), undefined, 50);

        const high = await createTrophyProfile(undefined, 'user-high', 'High');
        await createTrophy(undefined, high.id.toString(), undefined, 5000);

        const result = await trophyRepository.getTopSinceCreationHunters(2);

        expect(result).toHaveLength(2);
        expect(result[0]?.userId).toBe('user-high');
        expect(result[1]?.userId).toBe('user-mid');
    });

    test('getTopMonthlyHunters only sums trophies inside the requested month window', async () => {
        const now = new Date();
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const profile = await createTrophyProfile(undefined, 'user-mixed', 'Mixed');
        // Inside the current month.
        await createTrophy(undefined, profile.id.toString(), undefined, 100, now);
        // Outside the window — must not be counted.
        await createTrophy(undefined, profile.id.toString(), undefined, 9000, lastMonth);

        const outsideOnly = await createTrophyProfile(undefined, 'user-outside', 'Outside');
        await createTrophy(undefined, outsideOnly.id.toString(), undefined, 100, lastMonth);

        const result = await trophyRepository.getTopMonthlyHunters(10, now);

        expect(result).toHaveLength(1);
        expect(result[0]?.userId).toBe('user-mixed');
        expect(result[0]?.points).toBe(100);
        expect(result[0]?.num_trophies).toBe(1);
    });

    test('ties are broken deterministically by trophy count, then profile name', async () => {
        // Same points (100), different trophy counts: 2 trophies should rank
        // above 1 trophy.
        const fewerTrophies = await createTrophyProfile(undefined, 'user-fewer', 'ZFewer');
        await createTrophy(undefined, fewerTrophies.id.toString(), undefined, 100);

        const moreTrophies = await createTrophyProfile(undefined, 'user-more', 'AMore');
        await createTrophy(undefined, moreTrophies.id.toString(), undefined, 60);
        await createTrophy(undefined, moreTrophies.id.toString(), undefined, 40);

        // Same points AND same trophy count: alphabetical profile name wins.
        const alice = await createTrophyProfile(undefined, 'user-alice', 'Alice');
        await createTrophy(undefined, alice.id.toString(), undefined, 20);

        const bob = await createTrophyProfile(undefined, 'user-bob', 'Bob');
        await createTrophy(undefined, bob.id.toString(), undefined, 20);

        const result = await trophyRepository.getTopLifetimeHunters(10);

        expect(result.map((r) => r.userId)).toEqual([
            'user-more', // 100 pts, 2 trophies
            'user-fewer', // 100 pts, 1 trophy
            'user-alice', // 20 pts, "Alice" < "Bob"
            'user-bob', // 20 pts
        ]);

        // Repeated calls must be stable, not shuffle.
        const secondCall = await trophyRepository.getTopLifetimeHunters(10);
        expect(secondCall.map((r) => r.userId)).toEqual(result.map((r) => r.userId));
    });

    // M7.6: offset + count power `/trophy rank`'s pagination buttons.
    describe('pagination support', () => {
        test('getTopLifetimeHunters offset skips already-seen rows without re-shuffling order', async () => {
            const profiles = [
                ['user-a', 'A', 500],
                ['user-b', 'B', 400],
                ['user-c', 'C', 300],
                ['user-d', 'D', 200],
            ] as const;

            for (const [userId, name, points] of profiles) {
                const profile = await createTrophyProfile(undefined, userId, name);
                await createTrophy(undefined, profile.id.toString(), undefined, points);
            }

            const page1 = await trophyRepository.getTopLifetimeHunters(2, 0);
            const page2 = await trophyRepository.getTopLifetimeHunters(2, 2);

            expect(page1.map((r) => r.userId)).toEqual(['user-a', 'user-b']);
            expect(page2.map((r) => r.userId)).toEqual(['user-c', 'user-d']);
        });

        test('countLifetimeHunters / countSinceCreationHunters count ranked profiles, not trophy rows', async () => {
            const profileA = await createTrophyProfile(undefined, 'user-count-a', 'CountA');
            await createTrophy(undefined, profileA.id.toString(), undefined, 10);
            await createTrophy(undefined, profileA.id.toString(), undefined, 20);

            const profileB = await createTrophyProfile(undefined, 'user-count-b', 'CountB');
            await createTrophy(undefined, profileB.id.toString(), undefined, 5);

            expect(await trophyRepository.countLifetimeHunters()).toBe(2);
            expect(await trophyRepository.countSinceCreationHunters()).toBe(2);
        });

        test('countMonthlyHunters only counts profiles with a trophy inside the requested month', async () => {
            const now = new Date();
            const lastMonth = new Date(now);
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            const thisMonthProfile = await createTrophyProfile(
                undefined,
                'user-this-month',
                'ThisMonth',
            );
            await createTrophy(undefined, thisMonthProfile.id.toString(), undefined, 100, now);

            const lastMonthProfile = await createTrophyProfile(
                undefined,
                'user-last-month',
                'LastMonth',
            );
            await createTrophy(
                undefined,
                lastMonthProfile.id.toString(),
                undefined,
                100,
                lastMonth,
            );

            expect(await trophyRepository.countMonthlyHunters(now)).toBe(1);
        });

        test('a profile excluded from the ranking is not counted either', async () => {
            const excluded = await createTrophyProfile(
                undefined,
                'user-excluded-count',
                'ExcludedCount',
                false,
                false,
                true,
            );
            await createTrophy(undefined, excluded.id.toString(), undefined, 999999);

            expect(await trophyRepository.countLifetimeHunters()).toBe(0);
        });
    });

    test('findUserPosition returns the correct rank among more profiles than a naive top-N would show', async () => {
        // Six profiles with distinct points; the target user is 4th place —
        // outside a `limit: 3`-style truncation, proving the rank is computed
        // over the full ranked set, not a truncated one.
        const points = [500, 400, 300, 200, 100, 50];
        const userIds = points.map((_, i) => `user-rank-${i}`);

        for (let i = 0; i < points.length; i++) {
            const profile = await createTrophyProfile(undefined, userIds[i], `Profile${i}`);
            await createTrophy(undefined, profile.id.toString(), undefined, points[i]);
        }

        const targetUserId = userIds[3]; // 200 points -> 4th place
        const position = await trophyRepository.findUserPosition(targetUserId as string);

        expect(position.totalPoints).toBe(200);
        expect(position.totalTrophies).toBe(1);
        expect(position.ranks[1].name).toBe('creation');
        expect(position.ranks[1].position).toBe(4);
        expect(position.ranks[2].name).toBe('lifetime');
        expect(position.ranks[2].position).toBe(4);
    });

    test('findUserPosition returns zero ranks for a user with no trophies', async () => {
        const position = await trophyRepository.findUserPosition('user-with-nothing');

        expect(position.totalPoints).toBe(0);
        expect(position.totalTrophies).toBe(0);
        expect(position.ranks).toEqual([
            { name: 'monthly', position: 0, points: 0, trophies: 0 },
            { name: 'creation', position: 0, points: 0, trophies: 0 },
            { name: 'lifetime', position: 0, points: 0, trophies: 0 },
        ]);
    });

    test('findUserPosition excludes profiles flagged isExcluded from the ranking', async () => {
        const excluded = await createTrophyProfile(
            undefined,
            'user-excluded',
            'Excluded',
            false,
            false,
            true,
        );
        await createTrophy(undefined, excluded.id.toString(), undefined, 999999);

        const position = await trophyRepository.findUserPosition('user-excluded');

        expect(position.totalPoints).toBe(0);
        expect(position.ranks[1].position).toBe(0);
    });

    // M7.3: existsByProfileAndUrl / create — the write-side enforcement of
    // one claim per (profile, url), which TrophiesSyncJob's catch-up mode
    // depends on.
    describe('existsByProfileAndUrl / create', () => {
        test('existsByProfileAndUrl is false for a url never claimed by this profile', async () => {
            const profile = await createTrophyProfile(undefined, 'user-1', 'Profile1');

            const exists = await trophyRepository.existsByProfileAndUrl(
                profile.id.toString(),
                'https://psnprofiles.com/trophies/1-game/Profile1',
            );

            expect(exists).toBe(false);
        });

        test('create() saves a new trophy and existsByProfileAndUrl then reports true', async () => {
            const profile = await createTrophyProfile(undefined, 'user-2', 'Profile2');
            const url = 'https://psnprofiles.com/trophies/2-game/Profile2';

            const trophy = await trophyRepository.create(
                profile.id.toString(),
                url,
                250,
                new Date(),
            );

            expect(trophy.url).toBe(url);
            expect(trophy.points).toBe(250);
            expect(await trophyRepository.existsByProfileAndUrl(profile.id.toString(), url)).toBe(
                true,
            );
        });

        test('create() throws TrophyAlreadyClaimed for a (profile, url) pair claimed twice', async () => {
            const profile = await createTrophyProfile(undefined, 'user-3', 'Profile3');
            const url = 'https://psnprofiles.com/trophies/3-game/Profile3';

            await trophyRepository.create(profile.id.toString(), url, 100, new Date());

            await expect(
                trophyRepository.create(profile.id.toString(), url, 100, new Date()),
            ).rejects.toBeInstanceOf(TrophyAlreadyClaimed);
        });

        test('the same url claimed by two different profiles does not collide', async () => {
            const profileA = await createTrophyProfile(undefined, 'user-4a', 'Profile4a');
            const profileB = await createTrophyProfile(undefined, 'user-4b', 'Profile4b');
            const url = 'https://psnprofiles.com/trophies/4-game/shared-trophy-page';

            await trophyRepository.create(profileA.id.toString(), url, 100, new Date());

            await expect(
                trophyRepository.create(profileB.id.toString(), url, 100, new Date()),
            ).resolves.toBeDefined();
        });
    });

    describe('findMissingCompletionDate', () => {
        // create() requires a real Date (TrophiesSyncJob only ever has one to
        // give it); a null completionDate is a historical/imported-data case,
        // so these fixtures go through save() directly, matching how such
        // rows actually get into the table.
        function trophyWithNullCompletionDate(profileId: string, url: string): Trophy {
            return new Trophy(
                TrophyId.generate(),
                profileId,
                url,
                100,
                null,
                new Date(),
                new Date(),
            );
        }

        test('returns only rows with a null completionDate, bounded by limit', async () => {
            const profile = await createTrophyProfile(undefined, 'user-5', 'Profile5');
            const withDate = await createTrophy(
                undefined,
                profile.id.toString(),
                'https://psnprofiles.com/trophies/5-game/with-date',
                100,
                new Date(),
            );
            const missing1 = trophyWithNullCompletionDate(
                profile.id.toString(),
                'https://psnprofiles.com/trophies/5-game/missing-1',
            );
            await trophyRepository.save(missing1);

            const results = await trophyRepository.findMissingCompletionDate(10);

            const ids = results.map((trophy) => trophy.id.toString());
            expect(ids).toContain(missing1.id.toString());
            expect(ids).not.toContain(withDate.id.toString());
        });

        test('respects the limit', async () => {
            const profile = await createTrophyProfile(undefined, 'user-6', 'Profile6');
            for (let i = 0; i < 5; i++) {
                await trophyRepository.save(
                    trophyWithNullCompletionDate(
                        profile.id.toString(),
                        `https://psnprofiles.com/trophies/6-game/missing-${i}`,
                    ),
                );
            }

            const results = await trophyRepository.findMissingCompletionDate(2);

            expect(results).toHaveLength(2);
        });
    });

    describe('findCatchUpSummariesSince (backfill announcement)', () => {
        const SINCE = new Date('2024-11-30T00:00:00Z');

        test('aggregates per member and filters to trophies earned on or after `since`', async () => {
            const profile = await createTrophyProfile(undefined, 'user-a', 'HunterA');
            // Before the window — must not be counted.
            await createTrophy(
                undefined,
                profile.id.toString(),
                'https://p/1',
                500,
                new Date('2024-06-01'),
            );
            // Inside the window.
            await createTrophy(
                undefined,
                profile.id.toString(),
                'https://p/2',
                250,
                new Date('2025-03-04'),
            );
            await createTrophy(
                undefined,
                profile.id.toString(),
                'https://p/3',
                800,
                new Date('2026-01-20'),
            );

            const summaries = await trophyRepository.findCatchUpSummariesSince(SINCE);

            expect(summaries).toHaveLength(1);
            expect(summaries[0]!.userId).toBe('user-a');
            expect(summaries[0]!.numTrophies).toBe(2);
            expect(summaries[0]!.points).toBe(1050);
            expect(summaries[0]!.firstCompletionDate.toISOString().slice(0, 10)).toBe('2025-03-04');
            expect(summaries[0]!.lastCompletionDate.toISOString().slice(0, 10)).toBe('2026-01-20');
        });

        test('orders by points so the biggest hauls are announced first', async () => {
            const small = await createTrophyProfile(undefined, 'user-small', 'Small');
            await createTrophy(
                undefined,
                small.id.toString(),
                'https://s/1',
                50,
                new Date('2025-05-05'),
            );
            const big = await createTrophyProfile(undefined, 'user-big', 'Big');
            await createTrophy(
                undefined,
                big.id.toString(),
                'https://b/1',
                2000,
                new Date('2025-05-05'),
            );

            const summaries = await trophyRepository.findCatchUpSummariesSince(SINCE);

            expect(summaries.map((s) => s.userId)).toEqual(['user-big', 'user-small']);
        });

        test('skips excluded profiles and profiles with nobody to mention', async () => {
            const excluded = await createTrophyProfile(
                undefined,
                'user-excluded',
                'Excluded',
                false,
                false,
                true,
            );
            await createTrophy(
                undefined,
                excluded.id.toString(),
                'https://e/1',
                500,
                new Date('2025-05-05'),
            );

            // No linked Discord account — there is no one to @mention.
            const orphan = await createTrophyProfile(undefined, '', 'Orphan');
            await createTrophy(
                undefined,
                orphan.id.toString(),
                'https://o/1',
                500,
                new Date('2025-05-05'),
            );

            const summaries = await trophyRepository.findCatchUpSummariesSince(SINCE);

            expect(summaries).toHaveLength(0);
        });

        test('returns nothing when no trophies fall inside the window', async () => {
            const profile = await createTrophyProfile(undefined, 'user-old', 'OldOnly');
            await createTrophy(
                undefined,
                profile.id.toString(),
                'https://x/1',
                500,
                new Date('2024-01-01'),
            );

            expect(await trophyRepository.findCatchUpSummariesSince(SINCE)).toHaveLength(0);
        });
    });
});
