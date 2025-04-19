import { describe, expect, beforeEach, it, afterEach } from 'bun:test'
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config'
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types'
import { DeleteAd } from '../../../../../../src/Application/Write/Marketplace/DeleteAd/DeleteAd'
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId'
import DatabaseUtil from "../../../../../Helper/DatabaseUtil"
import { PrismaClient } from "@prisma/client"
import CommandHandlerManager from "../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager"
import { createAd } from '../../../../../Helper/StaticFixtures'
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository'
import { UnauthorizedAdDeletion } from '../../../../../../src/Domain/Marketplace/UnauthorizedAdDeletion'
import RecordNotFound from "../../../../../../src/Domain/RecordNotFound.ts";

describe('DeleteAdHandler Integration Test', () => {
  let commandHandlerManager: CommandHandlerManager
  let ormClient: PrismaClient
  let adRepository: AdRepository

  beforeEach(async () => {
    commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager)
    ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient)
    adRepository = myContainer.get<AdRepository>(TYPES.AdRepository)

    await DatabaseUtil.truncateAllTables()
  })

  afterEach(async () => {
    await ormClient.$disconnect()
  })

  it('should delete an ad when user is the owner', async () => {
    // Arrange
    const userId = '123456789012345678'
    const ad = await createAd(undefined, 'Test Ad', userId)
    const command = new DeleteAd(ad.id, userId)

    // Act
    await commandHandlerManager.handle(command)

    // Assert
    await expect(adRepository.get(ad.id))
      .rejects
      .toThrow(RecordNotFound)
  })

  it('should throw RecordNotFound when ad does not exist', async () => {
    // Arrange
    const adId = AdId.generate()
    const userId = '123456789012345678'
    const command = new DeleteAd(adId, userId)

    // Act & Assert
    await expect(commandHandlerManager.handle(command))
      .rejects
      .toThrow(RecordNotFound)
  })

  it('should throw UnauthorizedAdDeletion when user is not the owner', async () => {
    // Arrange
    const ownerId = '123456789012345678'
    const differentUserId = '987654321098765432'
    const ad = await createAd(undefined, 'Test Ad', ownerId)
    const command = new DeleteAd(ad.id, differentUserId)

    // Act & Assert
    await expect(commandHandlerManager.handle(command))
      .rejects
      .toThrow(UnauthorizedAdDeletion)
  })
})
