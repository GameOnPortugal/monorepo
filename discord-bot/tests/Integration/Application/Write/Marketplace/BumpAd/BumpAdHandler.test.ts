import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { BumpAd } from '../../../../../../src/Application/Write/Marketplace/BumpAd/BumpAd';
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository';
import { UnauthorizedAdAction } from '../../../../../../src/Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../../../src/Domain/Marketplace/AdNotActive';
import { AdBumpRateLimited } from '../../../../../../src/Domain/Marketplace/AdBumpRateLimited';
import RecordNotFound from '../../../../../../src/Domain/RecordNotFound.ts';
import type { GuildClient } from '../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import { CommunityChannels } from '../../../../../../src/Domain/Community/CommunityChannels';

const MARKETPLACE_CHANNEL_ID = '818447274266591243';

/**
 * M5.6: `BumpAdHandler` backs both the `🔄 Renovar` button (M5.5) and
 * `/marketplace bump`, rate-limited to once per ad per 72h (plan 01's
 * Limits section).
 */
describe('BumpAdHandler Integration Test', () => {
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

    it('reposts the listing and records the new message when never bumped before', async () => {
        const userId = '123456789012345678';
        const oldMessageId = 'old-listing-message';
        guildClient.registerMessage(oldMessageId);
        const ad = await createAd(
            undefined,
            'Test Ad',
            userId,
            MARKETPLACE_CHANNEL_ID,
            oldMessageId,
        );

        await commandHandlerManager.handle(new BumpAd(ad.id, userId, MARKETPLACE_CHANNEL_ID));

        expect(guildClient.deletedMessages).toEqual([
            { channelId: MARKETPLACE_CHANNEL_ID, messageId: oldMessageId },
        ]);
        expect(guildClient.sentRichMessages.length).toBe(1);
        expect(guildClient.sentRichMessages[0]?.channel).toBe(CommunityChannels.MARKETPLACE);

        const updated = await adRepository.get(ad.id);
        expect(updated.messageId).not.toBe(oldMessageId);
        expect(updated.messageId).not.toBe('');
        expect(updated.bumpedAt).not.toBeNull();
        expect(updated.channelId).toBe(MARKETPLACE_CHANNEL_ID);
    });

    it('refuses a second bump within 72h', async () => {
        const userId = '123456789012345678';
        const messageId = 'listing-message';
        guildClient.registerMessage(messageId);
        const ad = await createAd(undefined, 'Test Ad', userId, MARKETPLACE_CHANNEL_ID, messageId);

        await commandHandlerManager.handle(new BumpAd(ad.id, userId, MARKETPLACE_CHANNEL_ID));

        await expect(
            commandHandlerManager.handle(new BumpAd(ad.id, userId, MARKETPLACE_CHANNEL_ID)),
        ).rejects.toThrow(AdBumpRateLimited);

        // Only the first bump actually reposted.
        expect(guildClient.sentRichMessages.length).toBe(1);
    });

    it('allows a bump once 72h have passed since the last one', async () => {
        const userId = '123456789012345678';
        const messageId = 'listing-message';
        guildClient.registerMessage(messageId);
        const seventyThreeHoursAgo = new Date(Date.now() - 73 * 60 * 60 * 1000);
        const ad = await createAd(
            undefined, // id
            'Test Ad', // name
            userId, // authorId
            MARKETPLACE_CHANNEL_ID, // channelId
            messageId, // messageId
            undefined, // state
            undefined, // price
            undefined, // zone
            undefined, // dispatch
            undefined, // warranty
            undefined, // description
            undefined, // adType
            undefined, // createdAt
            undefined, // updatedAt
            AdStatus.active(), // status
            null, // priceCents
            undefined, // images
            seventyThreeHoursAgo, // bumpedAt
        );

        await commandHandlerManager.handle(new BumpAd(ad.id, userId, MARKETPLACE_CHANNEL_ID));

        const updated = await adRepository.get(ad.id);
        expect(updated.bumpedAt?.getTime()).toBeGreaterThan(seventyThreeHoursAgo.getTime());
    });

    it('refuses a non-owner', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId, MARKETPLACE_CHANNEL_ID);

        await expect(
            commandHandlerManager.handle(new BumpAd(ad.id, otherUserId, MARKETPLACE_CHANNEL_ID)),
        ).rejects.toThrow(UnauthorizedAdAction);
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
            commandHandlerManager.handle(new BumpAd(ad.id, userId, MARKETPLACE_CHANNEL_ID)),
        ).rejects.toThrow(AdNotActive);
    });

    it('throws RecordNotFound for a non-existent ad', async () => {
        await expect(
            commandHandlerManager.handle(
                new BumpAd(AdId.generate(), '123456789012345678', MARKETPLACE_CHANNEL_ID),
            ),
        ).rejects.toThrow(RecordNotFound);
    });
});
