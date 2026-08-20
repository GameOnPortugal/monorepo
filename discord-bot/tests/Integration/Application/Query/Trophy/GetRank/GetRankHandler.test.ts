import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GetRank } from '../../../../../../src/Application/Query/Trophy/GetRank/GetRank';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { createTrophyProfile, createTrophy } from '../../../../../Helper/StaticFixtures';
import type { RankPage } from '../../../../../../src/Domain/Trophy/RankPage';
import type { UserPosition } from '../../../../../../src/Domain/Trophy/UserPosition';

describe('GetRankHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('should return monthly rankings', async () => {
        // Arrange
        const profile1 = await createTrophyProfile(undefined, '123456789012345678');
        const profile2 = await createTrophyProfile(undefined, '987654321098765432');

        // Create trophies for this month
        await createTrophy(undefined, profile1.id.toString(), undefined, 100);
        await createTrophy(undefined, profile2.id.toString(), undefined, 50);

        const command = new GetRank('monthly', '123', 10);

        // Act
        const result = (await commandHandlerManager.handle(command)) as RankPage;

        // Assert
        expect(result.data).toHaveLength(2);
        expect(result.data[0]?.points).toBe(100);
        expect(result.data[1]?.points).toBe(50);
        expect(result.page).toBe(1);
        expect(result.totalPages).toBe(1);
        expect(result.totalCount).toBe(2);
    });

    test('should return lifetime rankings', async () => {
        // Arrange
        const profile = await createTrophyProfile();
        await createTrophy(undefined, profile.id.toString(), undefined, 100);
        await createTrophy(undefined, profile.id.toString(), undefined, 50);

        const command = new GetRank('lifetime', '123', 10);

        // Act
        const result = (await commandHandlerManager.handle(command)) as RankPage;

        // Assert
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.points).toBe(150);
        expect(result.data[0]?.num_trophies).toBe(2);
    });

    test('should return user position in all rankings', async () => {
        // Arrange
        const userId = '123456789012345678';
        const profile = await createTrophyProfile(undefined, userId, 'User1');
        await createTrophy(undefined, profile.id.toString(), undefined, 100);
        await createTrophy(undefined, profile.id.toString(), undefined, 50);

        const command = new GetRank('user', userId, 10);

        // Act
        const result = (await commandHandlerManager.handle(command)) as UserPosition;

        // Assert
        expect(result.totalPoints).toBe(150);
        expect(result.totalTrophies).toBe(2);
    });

    test('should return user position for target user', async () => {
        // Arrange
        const targetUserId = '987654321098765432';
        const profile = await createTrophyProfile(undefined, targetUserId, 'User2');
        await createTrophy(undefined, profile.id.toString(), undefined, 200);

        const command = new GetRank('user', targetUserId, 10, undefined, undefined);

        // Act
        const result = (await commandHandlerManager.handle(command)) as UserPosition;

        // Assert
        expect(result.totalPoints).toBe(200);
        expect(result.totalTrophies).toBe(1);
    });

    test('should return zero positions when user has no trophies', async () => {
        // Arrange
        const userId = '123456789012345678';
        const command = new GetRank('user', userId, 10);

        // Act
        const result = (await commandHandlerManager.handle(command)) as UserPosition;

        // Assert
        expect(result.totalPoints).toBe(0);
        expect(result.totalTrophies).toBe(0);
        expect(result.ranks).toEqual([
            { name: 'monthly', position: 0, points: 0, trophies: 0 },
            { name: 'creation', position: 0, points: 0, trophies: 0 },
            { name: 'lifetime', position: 0, points: 0, trophies: 0 },
        ]);
    });

    test('should return empty rankings when no trophies exist', async () => {
        // Arrange
        const command = new GetRank('monthly', '123', 10);

        // Act
        const result = (await commandHandlerManager.handle(command)) as RankPage;

        // Assert
        expect(result.data).toHaveLength(0);
        expect(result.totalCount).toBe(0);
        // Always at least one page, even with no data — a caller renders
        // "page 1 of 1, empty" rather than special-casing zero pages.
        expect(result.totalPages).toBe(1);
        expect(result.page).toBe(1);
    });

    test('should return monthly rankings for last month', async () => {
        // Create trophies for last month
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const profile = await createTrophyProfile(undefined, '123456789012345678', 'User1');
        await createTrophy(undefined, profile.id.toString(), undefined, 100, lastMonth);

        const result = (await commandHandlerManager.handle(
            new GetRank('monthly', '123', 10, 'last'),
        )) as RankPage;

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.points).toBe(100);
    });

    test('should return monthly rankings for specific month', async () => {
        // Create trophies for January
        const january = new Date();
        january.setMonth(0); // January is 0-indexed

        const profile = await createTrophyProfile(undefined, '987654321098765432', 'User2');
        await createTrophy(undefined, profile.id.toString(), undefined, 100, january);

        const result = (await commandHandlerManager.handle(
            new GetRank('monthly', '123', 10, 1),
        )) as RankPage;

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.points).toBe(100);
    });

    test('should return monthly rankings for specific month and year', async () => {
        // Create trophies for April 2024
        const april2024 = new Date(2024, 3); // April is 3 (0-indexed)

        const profile = await createTrophyProfile(undefined, '111222333444555666', 'User3');
        await createTrophy(undefined, profile.id.toString(), undefined, 150, april2024);

        const result = (await commandHandlerManager.handle(
            new GetRank('monthly', '123', 10, 4, 2024),
        )) as RankPage;

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.points).toBe(150);
    });

    test('should return monthly rankings for last month of previous year', async () => {
        // Create trophies for December 2024
        const dec2024 = new Date(2024, 11); // December is 11 (0-indexed)

        const profile = await createTrophyProfile(undefined, '777888999000111222', 'User4');
        await createTrophy(undefined, profile.id.toString(), undefined, 200, dec2024);

        const result = (await commandHandlerManager.handle(
            new GetRank('monthly', '123', 10, 12, 2024),
        )) as RankPage;

        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.points).toBe(200);
    });

    test('should return empty rankings for future month and year', async () => {
        // Try to get rankings for December 2025
        const result = (await commandHandlerManager.handle(
            new GetRank('monthly', '123', 10, 12, 2025),
        )) as RankPage;

        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data).toHaveLength(0);
    });

    describe('pagination (M7.6)', () => {
        async function createRankedProfiles(count: number): Promise<void> {
            for (let i = 0; i < count; i++) {
                const profile = await createTrophyProfile(
                    undefined,
                    `${100000000000000000 + i}`,
                    `Player${String(i).padStart(2, '0')}`,
                );
                // Descending points so profile order is deterministic and
                // matches insertion order: Player00 is #1, Player01 is #2, ...
                await createTrophy(undefined, profile.id.toString(), undefined, count - i);
            }
        }

        test('pages forward through a lifetime ranking', async () => {
            await createRankedProfiles(5);

            const page1 = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, 1),
            )) as RankPage;
            const page2 = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, 2),
            )) as RankPage;
            const page3 = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, 3),
            )) as RankPage;

            expect(page1.data.map((r) => r.psnProfile)).toEqual(['Player00', 'Player01']);
            expect(page2.data.map((r) => r.psnProfile)).toEqual(['Player02', 'Player03']);
            expect(page3.data.map((r) => r.psnProfile)).toEqual(['Player04']);
            expect(page1.totalPages).toBe(3);
            expect(page1.totalCount).toBe(5);
        });

        test('paging back from page 2 to page 1 lands on the original slice', async () => {
            await createRankedProfiles(4);

            const page2 = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, 2),
            )) as RankPage;
            const backToPage1 = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, page2.page - 1),
            )) as RankPage;

            expect(backToPage1.page).toBe(1);
            expect(backToPage1.data.map((r) => r.psnProfile)).toEqual(['Player00', 'Player01']);
        });

        test('clamps a page number beyond the last page down to the last page, rather than an empty result', async () => {
            await createRankedProfiles(3);

            const result = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, 999),
            )) as RankPage;

            // 3 rows, page size 2 -> 2 pages. Page 999 clamps to page 2,
            // which still has data (the 3rd row), not an empty page.
            expect(result.totalPages).toBe(2);
            expect(result.page).toBe(2);
            expect(result.data).toHaveLength(1);
            expect(result.data[0]?.psnProfile).toBe('Player02');
        });

        test('clamps a page number of 0 or negative up to page 1', async () => {
            await createRankedProfiles(3);

            const result = (await commandHandlerManager.handle(
                new GetRank('lifetime', '123', 2, undefined, undefined, -5),
            )) as RankPage;

            expect(result.page).toBe(1);
            expect(result.data.map((r) => r.psnProfile)).toEqual(['Player00', 'Player01']);
        });
    });
});
