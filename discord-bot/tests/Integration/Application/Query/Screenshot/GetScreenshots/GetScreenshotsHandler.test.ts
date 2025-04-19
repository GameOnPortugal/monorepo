import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GetScreenshots } from '../../../../../../src/Application/Query/Screenshot/GetScreenshots/GetScreenshots';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil";
import { createScreenshot } from "../../../../../Helper/StaticFixtures";
import { Screenshot } from "../../../../../../src/Domain/Screenshot/Screenshot";

describe('GetScreenshotsHandler Integration Test', () => {
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

  test('should return empty array when no screenshots exist for user', async () => {
    // Arrange
    const userId = '123456789012345678';
    const command = new GetScreenshots(userId);

    // Act
    const result = await commandHandlerManager.handle(command);

    // Assert
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });

  test('should return only screenshots for specified user', async () => {
    // Arrange
    const userId = '123456789012345678';
    const differentUserId = '987654321098765432';
    
    // Create screenshots for first user
    const screenshot1 = await createScreenshot();
    const screenshot2 = await createScreenshot();

    // Create screenshot for different user
    await createScreenshot(
      undefined,
      undefined,
      differentUserId
    );

    const command = new GetScreenshots(userId);

    // Act
    const result = await commandHandlerManager.handle(command);

    // Assert
    expect(result).toHaveLength(2);
    expect(result.map((s: Screenshot) => s.id.toString())).toContain(screenshot1.id.toString());
    expect(result.map((s: Screenshot) => s.id.toString())).toContain(screenshot2.id.toString());
    expect(result.every((s: Screenshot) => s.authorId === userId)).toBe(true);
  });

  test('should return all screenshots when userId is null', async () => {
    // Arrange
    const differentUserId = '987654321098765432';
    
    // Create screenshots for multiple users
    const screenshot1 = await createScreenshot(); // Default user
    const screenshot2 = await createScreenshot(
      undefined,
      undefined,
      differentUserId
    );

    const command = new GetScreenshots(null);

    // Act
    const result = await commandHandlerManager.handle(command);

    // Assert
    expect(result).toHaveLength(2);
    expect(result.map((s: Screenshot) => s.id.toString())).toContain(screenshot1.id.toString());
    expect(result.map((s: Screenshot) => s.id.toString())).toContain(screenshot2.id.toString());
  });

  test('should return screenshots sorted by creation date', async () => {
    // Arrange
    const olderDate = new Date('2024-01-01');
    const newerDate = new Date('2024-01-02');

    const screenshot1 = await createScreenshot(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      olderDate
    );

    const screenshot2 = await createScreenshot(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      newerDate
    );

    const command = new GetScreenshots('123456789012345678');

    // Act
    const result = await commandHandlerManager.handle(command);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].id.toString()).toBe(screenshot2.id.toString()); // Newer first
    expect(result[1].id.toString()).toBe(screenshot1.id.toString()); // Older second
  });
});
