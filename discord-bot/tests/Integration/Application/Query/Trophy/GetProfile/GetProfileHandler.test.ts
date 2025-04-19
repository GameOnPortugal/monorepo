import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GetProfile } from '../../../../../../src/Application/Query/Trophy/GetProfile/GetProfile';
import { ProfileNotFound } from '../../../../../../src/Application/Query/Trophy/GetProfile/ProfileNotFound';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil";
import { createTrophyProfile } from "../../../../../Helper/StaticFixtures";

describe('GetProfileHandler Integration Test', () => {
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

    test('should return profile when it exists', async () => {
        // Arrange
        const userId = '123456789012345678';
        const profile = await createTrophyProfile();
        const command = new GetProfile(userId);

        // Act
        const result = await commandHandlerManager.handle(command);

        // Assert
        expect(result.id.toString()).toBe(profile.id.toString());
        expect(result.userId).toBe(userId);
        expect(result.psnProfile).toBe(profile.psnProfile);
        expect(result.isBanned).toBe(false);
        expect(result.hasLeft).toBe(false);
        expect(result.isExcluded).toBe(false);
    });

    test('should throw ProfileNotFound when profile does not exist', async () => {
        // Arrange
        const userId = '987654321098765432'; // Different user ID
        const command = new GetProfile(userId);

        // Act & Assert
        await expect(commandHandlerManager.handle(command))
            .rejects
            .toThrow(ProfileNotFound);
    });

    test('should return correct profile when multiple profiles exist', async () => {
        // Arrange
        const userId1 = '123456789012345678';
        const userId2 = '987654321098765432';
        
        // Create two profiles
        const profile1 = await createTrophyProfile();
        await createTrophyProfile(
            undefined,
            userId2
        );

        const command = new GetProfile(userId1);

        // Act
        const result = await commandHandlerManager.handle(command);

        // Assert
        expect(result.id.toString()).toBe(profile1.id.toString());
        expect(result.userId).toBe(userId1);
    });
});
