import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DeleteScreenshot } from '../../../../../../src/Application/Write/Screenshot/DeleteScreenshot/DeleteScreenshot';
import { NotAuthorized } from '../../../../../../src/Application/Write/Screenshot/DeleteScreenshot/NotAuthorized';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil";
import { createScreenshot } from "../../../../../Helper/StaticFixtures";
import { ScreenshotId } from "../../../../../../src/Domain/Screenshot/ScreenshotId";

describe('DeleteScreenshotHandler Integration Test', () => {
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

  test('should delete a screenshot successfully when user is the author', async () => {
    // Arrange
    const authorId = '123456789012345678';
    const screenshotId = ScreenshotId.generate();
    
    // Create a screenshot using the fixture
    await createScreenshot(
      screenshotId,
      'Test Screenshot',
      authorId
    );

    const command = new DeleteScreenshot(
      screenshotId,
      authorId
    );

    // Act
    await commandHandlerManager.handle(command);

    // Assert
    const deletedScreenshot = await ormClient.screenshot.findUnique({
      where: { id: screenshotId.toString() }
    });

    expect(deletedScreenshot).toBeNull();
  });

  test('should throw NotAuthorized when user is not the author', async () => {
    // Arrange
    const authorId = '123456789012345678';
    const differentUserId = '987654321098765432';
    const screenshotId = ScreenshotId.generate();
    
    // Create a screenshot using the fixture
    await createScreenshot(
      screenshotId,
      'Test Screenshot',
      authorId
    );

    const command = new DeleteScreenshot(
      screenshotId,
      differentUserId // Different user trying to delete
    );

    // Act & Assert
    await expect(commandHandlerManager.handle(command))
      .rejects
      .toThrow(NotAuthorized);

    // Verify screenshot still exists
    const screenshot = await ormClient.screenshot.findUnique({
      where: { id: screenshotId.toString() }
    });

    expect(screenshot).not.toBeNull();
  });
});
