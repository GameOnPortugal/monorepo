import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { TrophyRepository } from '../../../../src/Domain/Trophy/TrophyRepository';
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
});
