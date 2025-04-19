import {describe, expect, beforeEach, it, afterEach} from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config'
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types'
import { CreateAd } from '../../../../../../src/Application/Write/Marketplace/CreateAd/CreateAd'
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId'
import DatabaseUtil from "../../../../../Helper/DatabaseUtil.ts";
import {PrismaClient} from "@prisma/client";
import CommandHandlerManager from "../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager";
import type {AdRepository} from "../../../../../../src/Domain/Marketplace/AdRepository.ts";

describe('CreateAdHandler Integration Test', () => {
  let commandHandlerManager: CommandHandlerManager;
  let ormClient: PrismaClient;

  beforeEach(async () => {
    commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
    ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

    await DatabaseUtil.truncateAllTables()
  })

  afterEach(async () => {
    await ormClient.$disconnect();
  });

  it('should create an ad', async () => {
    // Arrange
    const adId = AdId.generate();
    const command = new CreateAd(
      adId,
      'Test Ad',
      '123456789012345678',
      '987654321098765432',
      '123987456654789321',
      'active',
      '100€',
      'Porto',
      'Included',
      '2 years',
      'Test ad description',
      'sale'
    )

    // Act
    await commandHandlerManager.handle(command)

    // Assert
    const adRepository = myContainer.get<AdRepository>(TYPES.AdRepository)
    const ad = await adRepository.get(adId)

    expect(ad).not.toBeNull()
    expect(ad.id.toString()).toBe(adId.toString())
    expect(ad.name).toBe('Test Ad')
    expect(ad.authorId).toBe('123456789012345678')
    expect(ad.channelId).toBe('987654321098765432')
    expect(ad.messageId).toBe('123987456654789321')
    expect(ad.state).toBe('active')
    expect(ad.price).toBe('100€')
    expect(ad.zone).toBe('Porto')
    expect(ad.dispatch).toBe('Included')
    expect(ad.warranty).toBe('2 years')
    expect(ad.description).toBe('Test ad description')
    expect(ad.adType).toBe('sale')
    expect(ad.createdAt).toBeInstanceOf(Date)
    expect(ad.updatedAt).toBeInstanceOf(Date)
  })
})
