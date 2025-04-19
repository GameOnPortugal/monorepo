import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ListUserAds } from '../../../../../../src/Application/Query/Marketplace/ListUserAds/ListUserAds';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil";
import { createAd } from "../../../../../Helper/StaticFixtures";
import { Ad } from "../../../../../../src/Domain/Marketplace/Ad";

describe('ListUserAdsHandler Integration Test', () => {
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

  test('should return empty array when no ads exist for user', async () => {
    // Arrange
    const userId = '123456789012345678';
    const query = new ListUserAds(userId);

    // Act
    const result = await commandHandlerManager.handle(query);

    // Assert
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });

  test('should return only ads for specified user', async () => {
    // Arrange
    const userId = '123456789012345678';
    const differentUserId = '987654321098765432';
    
    // Create ads for first user
    const ad1 = await createAd(undefined, 'PS5', userId);
    const ad2 = await createAd(undefined, 'Xbox Series X', userId);

    // Create ad for different user
    await createAd(undefined, 'Nintendo Switch', differentUserId);

    const query = new ListUserAds(userId);

    // Act
    const result = await commandHandlerManager.handle(query);

    // Assert
    expect(result).toHaveLength(2);
    expect(result.map((a: Ad) => a.id.toString())).toContain(ad1.id.toString());
    expect(result.map((a: Ad) => a.id.toString())).toContain(ad2.id.toString());
    expect(result.every((a: Ad) => a.authorId === userId)).toBe(true);
  });

  test('should return ads sorted by creation date', async () => {
    // Arrange
    const userId = '123456789012345678';
    const olderDate = new Date('2024-01-01');
    const newerDate = new Date('2024-01-02');

    const olderAd = await createAd(
      undefined,
      'PS5',
      userId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      olderDate,
      olderDate
    );

    const newerAd = await createAd(
      undefined,
      'Xbox Series X',
      userId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      newerDate,
      newerDate
    );

    const query = new ListUserAds(userId);

    // Act
    const result = await commandHandlerManager.handle(query);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].id.toString()).toBe(newerAd.id.toString());
    expect(result[1].id.toString()).toBe(olderAd.id.toString());
  });
});
