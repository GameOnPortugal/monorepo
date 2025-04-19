import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CreateProfile } from '../../../../../../src/Application/Write/Trophy/CreateProfile/CreateProfile';
import { TrophyProfileId } from '../../../../../../src/Domain/Trophy/TrophyProfileId';
import { ProfileAlreadyExists } from '../../../../../../src/Application/Write/Trophy/CreateProfile/ProfileAlreadyExists';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import {myContainer} from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config.ts";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil.ts";

describe('CreateProfileHandler Integration Test', () => {
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

  test('should create a new trophy profile successfully', async () => {
    // Arrange
    const profileId = TrophyProfileId.generate();
    const userId = 'user123';
    const psnProfile = 'testPsnProfile';
    const command = new CreateProfile(profileId, userId, psnProfile);

    // Act
    await commandHandlerManager.handle(command);

    // Assert
    const createdProfile = await ormClient.trophyProfile.findUnique({
      where: { id: profileId.toString() }
    });

    expect(createdProfile).not.toBeNull();
    expect(createdProfile?.userId).toBe(userId);
    expect(createdProfile?.psnProfile).toBe(psnProfile);
    expect(createdProfile?.isBanned).toBe(false);
    expect(createdProfile?.hasLeft).toBe(false);
    expect(createdProfile?.isExcluded).toBe(false);
  });

  test('should throw ProfileAlreadyExists when user already has a profile', async () => {
    // Arrange
    const profileId1 = TrophyProfileId.generate();
    const profileId2 = TrophyProfileId.generate();
    const userId = 'user123';
    const psnProfile1 = 'testPsnProfile1';
    const psnProfile2 = 'testPsnProfile2';

    // Create first profile
    const command1 = new CreateProfile(profileId1, userId, psnProfile1);
    await commandHandlerManager.handle(command1);

    // Try to create second profile for same user
    const command2 = new CreateProfile(profileId2, userId, psnProfile2);

    // Act & Assert
    await expect(commandHandlerManager.handle(command2))
      .rejects
      .toThrow(ProfileAlreadyExists);
  });

  test('should throw ProfileAlreadyExists when PSN profile already exists', async () => {
    // Arrange
    const profileId1 = TrophyProfileId.generate();
    const profileId2 = TrophyProfileId.generate();
    const userId1 = 'user123';
    const userId2 = 'user456';
    const psnProfile = 'testPsnProfile';

    // Create first profile
    const command1 = new CreateProfile(profileId1, userId1, psnProfile);
    await commandHandlerManager.handle(command1);

    // Try to create second profile with same PSN profile
    const command2 = new CreateProfile(profileId2, userId2, psnProfile);

    // Act & Assert
    await expect(commandHandlerManager.handle(command2))
      .rejects
      .toThrow(ProfileAlreadyExists);
  });
});
