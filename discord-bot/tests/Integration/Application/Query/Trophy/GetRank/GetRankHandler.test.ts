import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GetRank } from '../../../../../../src/Application/Query/Trophy/GetRank/GetRank';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil";
import { createTrophyProfile, createTrophy } from "../../../../../Helper/StaticFixtures";
import type { TrophyRankData } from "../../../../../../src/Domain/Trophy/TrophyRankData";
import type { UserPosition } from "../../../../../../src/Domain/Trophy/UserPosition";

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
        const result = await commandHandlerManager.handle(command) as TrophyRankData[];

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0]?.points).toBe(100);
        expect(result[1]?.points).toBe(50);
    });

    test('should return lifetime rankings', async () => {
        // Arrange
        const profile = await createTrophyProfile();
        await createTrophy(undefined, profile.id.toString(), undefined, 100);
        await createTrophy(undefined, profile.id.toString(), undefined, 50);

        const command = new GetRank('lifetime', '123', 10);

        // Act
        const result = await commandHandlerManager.handle(command) as TrophyRankData[];

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0]?.points).toBe(150);
        expect(result[0]?.num_trophies).toBe(2);
    });

    test('should return user position in all rankings', async () => {
        // Arrange
        const userId = '123456789012345678';
        const profile = await createTrophyProfile(undefined, userId, 'User1');
        await createTrophy(undefined, profile.id.toString(), undefined, 100);
        await createTrophy(undefined, profile.id.toString(), undefined, 50);

        const command = new GetRank('user', userId, 10);

        // Act
        const result = await commandHandlerManager.handle(command) as UserPosition;

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
        const result = await commandHandlerManager.handle(command) as UserPosition;

        // Assert
        expect(result.totalPoints).toBe(200);
        expect(result.totalTrophies).toBe(1);
    });

    test('should return zero positions when user has no trophies', async () => {
        // Arrange
        const userId = '123456789012345678';
        const command = new GetRank('user', userId, 10);

        // Act
        const result = await commandHandlerManager.handle(command) as UserPosition;

        // Assert
        expect(result.totalPoints).toBe(0);
        expect(result.totalTrophies).toBe(0);
        expect(result.ranks).toEqual([
            { name: 'monthly', position: 0, points: 0, trophies: 0 },
            { name: 'creation', position: 0, points: 0, trophies: 0 },
            { name: 'lifetime', position: 0, points: 0, trophies: 0 }
        ]);
    });

    test('should return empty rankings when no trophies exist', async () => {
        // Arrange
        const command = new GetRank('monthly', '123', 10);

        // Act
        const result = await commandHandlerManager.handle(command) as TrophyRankData[];

        // Assert
        expect(result).toHaveLength(0);
    });

    test('should return monthly rankings for last month', async () => {
        // Create trophies for last month
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        
        const profile = await createTrophyProfile(undefined, '123456789012345678', 'User1');
        await createTrophy(undefined, profile.id.toString(), undefined, 100, lastMonth);

        const result = await commandHandlerManager.handle(new GetRank('monthly', '123', 10, 'last'));

        expect(result).toHaveLength(1);
        expect(result[0]?.points).toBe(100);
    });

    test('should return monthly rankings for specific month', async () => {
        // Create trophies for January
        const january = new Date();
        january.setMonth(0); // January is 0-indexed
        
        const profile = await createTrophyProfile(undefined, '987654321098765432', 'User2');
        await createTrophy(undefined, profile.id.toString(), undefined, 100, january);

        const result = await commandHandlerManager.handle(new GetRank('monthly', '123', 10, 1));

        expect(result).toHaveLength(1);
        expect(result[0]?.points).toBe(100);
    });

    test('should return monthly rankings for specific month and year', async () => {
        // Create trophies for April 2024
        const april2024 = new Date(2024, 3); // April is 3 (0-indexed)
        
        const profile = await createTrophyProfile(undefined, '111222333444555666', 'User3');
        await createTrophy(undefined, profile.id.toString(), undefined, 150, april2024);

        const result = await commandHandlerManager.handle(new GetRank('monthly', '123', 10, 4, 2024));

        expect(result).toHaveLength(1);
        expect(result[0]?.points).toBe(150);
    });

    test('should return monthly rankings for last month of previous year', async () => {
        // Create trophies for December 2024
        const dec2024 = new Date(2024, 11); // December is 11 (0-indexed)
        
        const profile = await createTrophyProfile(undefined, '777888999000111222', 'User4');
        await createTrophy(undefined, profile.id.toString(), undefined, 200, dec2024);

        const result = await commandHandlerManager.handle(new GetRank('monthly', '123', 10, 12, 2024));

        expect(result).toHaveLength(1);
        expect(result[0]?.points).toBe(200);
    });

    test('should return empty rankings for future month and year', async () => {
        // Try to get rankings for December 2025
        const result = await commandHandlerManager.handle(new GetRank('monthly', '123', 10, 12, 2025));

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
    });
});
