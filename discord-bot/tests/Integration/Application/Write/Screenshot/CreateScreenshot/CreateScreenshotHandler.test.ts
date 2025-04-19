import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CreateScreenshot } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/CreateScreenshot';
import { ScreenshotId } from '../../../../../../src/Domain/Screenshot/ScreenshotId';
import { ScreenshotAlreadyExist } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/ScreenshotAlreadyExist';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { PrismaClient } from '@prisma/client';
import { myContainer } from "../../../../../../src/Infrastructure/DependencyInjection/inversify.config";
import DatabaseUtil from "../../../../../Helper/DatabaseUtil.ts";

describe('CreateScreenshotHandler Integration Test', () => {
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

  test('should create a new screenshot successfully', async () => {
    // Arrange
    const screenshotId = ScreenshotId.generate();
    const name = 'Test Screenshot';
    const authorId = 'user123';
    const channelId = 'channel123';
    const messageId = 'message123';
    const platform = 'PS5';
    const imageUrl = 'https://placehold.co/600x400/png';

    const command = new CreateScreenshot(
      screenshotId,
      name,
      authorId,
      channelId,
      messageId,
      platform,
      imageUrl
    );

    // Act
    const result = await commandHandlerManager.handle(command);

    // Assert
    const createdScreenshot = await ormClient.screenshot.findUnique({
      where: { id: screenshotId.toString() }
    });

    expect(createdScreenshot).not.toBeNull();
    expect(createdScreenshot?.name).toBe(name);
    expect(createdScreenshot?.author_id).toBe(authorId);
    expect(createdScreenshot?.channel_id).toBe(channelId);
    expect(createdScreenshot?.message_id).toBe(messageId);
    expect(createdScreenshot?.plataform).toBe(platform);
    expect(createdScreenshot?.image).toBe(imageUrl);
    expect(createdScreenshot?.image_md5).toBeTruthy(); // MD5 should be generated
    expect(result.id.toString()).toBe(screenshotId.toString());
  });

  test('should throw ScreenshotAlreadyExist when screenshot with same MD5 exists', async () => {
    // Arrange
    const imageUrl = 'https://placehold.co/600x400/png';

    // Create first screenshot
    const command1 = new CreateScreenshot(
      ScreenshotId.generate(),
      'First Screenshot',
      'user123',
      'channel123',
      'message123',
      'PS5',
      imageUrl
    );
    await commandHandlerManager.handle(command1);

    // Try to create second screenshot with same image
    const command2 = new CreateScreenshot(
      ScreenshotId.generate(),
      'Second Screenshot',
      'user456',
      'channel456',
      'message456',
      'PS5',
      imageUrl
    );

    // Act & Assert
    await expect(commandHandlerManager.handle(command2))
      .rejects
      .toThrow(ScreenshotAlreadyExist);
  });
});
