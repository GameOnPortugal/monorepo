import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { MarkAdSold } from '../../../../../../src/Application/Write/Marketplace/MarkAdSold/MarkAdSold';
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository';
import { UnauthorizedAdAction } from '../../../../../../src/Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../../../src/Domain/Marketplace/AdNotActive';
import RecordNotFound from '../../../../../../src/Domain/RecordNotFound.ts';
import type { GuildClient } from '../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';

/**
 * M5.6: `MarkAdSoldHandler` backs both the `✅ Marcar vendido` button (M5.5)
 * and `/marketplace sold` — this is the one place the rule lives.
 */
describe('MarkAdSoldHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('marks an active ad sold when the caller is the owner', async () => {
        const userId = '123456789012345678';
        const channelId = '818447274266591243';
        const messageId = 'posted-listing-1';
        guildClient.registerMessage(messageId);
        const ad = await createAd(undefined, 'Test Ad', userId, channelId, messageId);

        await commandHandlerManager.handle(new MarkAdSold(ad.id, userId, false));

        const updated = await adRepository.get(ad.id);
        expect(updated.status.equals(AdStatus.sold())).toBe(true);
        expect(updated.soldAt).not.toBeNull();
        expect(guildClient.deletedMessages).toEqual([{ channelId, messageId }]);
    });

    it('refuses a non-owner, non-admin caller', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);

        await expect(
            commandHandlerManager.handle(new MarkAdSold(ad.id, otherUserId, false)),
        ).rejects.toThrow(UnauthorizedAdAction);

        const untouched = await adRepository.get(ad.id);
        expect(untouched.status.equals(AdStatus.active())).toBe(true);
    });

    it('allows an admin to mark someone else’s ad sold', async () => {
        const ownerId = '123456789012345678';
        const adminId = '987654321098765432';
        const channelId = '818447274266591243';
        const messageId = 'posted-listing-2';
        guildClient.registerMessage(messageId);
        const ad = await createAd(undefined, 'Test Ad', ownerId, channelId, messageId);

        await commandHandlerManager.handle(new MarkAdSold(ad.id, adminId, true));

        const updated = await adRepository.get(ad.id);
        expect(updated.status.equals(AdStatus.sold())).toBe(true);
        expect(guildClient.deletedMessages).toEqual([{ channelId, messageId }]);
    });

    it('refuses when the ad is not active', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(
            undefined, // id
            'Test Ad', // name
            userId, // authorId
            undefined, // channelId
            undefined, // messageId
            undefined, // state
            undefined, // price
            undefined, // zone
            undefined, // dispatch
            undefined, // warranty
            undefined, // description
            undefined, // adType
            undefined, // createdAt
            undefined, // updatedAt
            AdStatus.sold(), // status
        );

        await expect(
            commandHandlerManager.handle(new MarkAdSold(ad.id, userId, false)),
        ).rejects.toThrow(AdNotActive);
    });

    it('throws RecordNotFound for a non-existent ad', async () => {
        await expect(
            commandHandlerManager.handle(
                new MarkAdSold(AdId.generate(), '123456789012345678', false),
            ),
        ).rejects.toThrow(RecordNotFound);
    });
});
