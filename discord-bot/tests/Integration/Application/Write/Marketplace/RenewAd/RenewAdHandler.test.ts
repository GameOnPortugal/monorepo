import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { RenewAd } from '../../../../../../src/Application/Write/Marketplace/RenewAd/RenewAd';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import { UnauthorizedAdRenewal } from '../../../../../../src/Domain/Marketplace/UnauthorizedAdRenewal';
import { AdNotEligibleForRenewal } from '../../../../../../src/Domain/Marketplace/AdNotEligibleForRenewal';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository';
import type { GuildClient } from '../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';

describe('RenewAdHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;

    const marketplaceChannelId = '818447274266591243';

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

    async function pendingAd(userId: string, oldMessageId = 'old-listing-message') {
        guildClient.registerMessage(oldMessageId);
        return createAd(
            undefined,
            'Test Ad',
            userId,
            marketplaceChannelId,
            oldMessageId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.pendingRenewal(),
        );
    }

    it('bumps the same row: same id, new message, status back to active, no duplicate created', async () => {
        const userId = '123456789012345678';
        const ad = await pendingAd(userId);

        await commandHandlerManager.handle(new RenewAd(ad.id, userId, marketplaceChannelId));

        // Old message removed, one new message posted.
        expect(guildClient.deletedMessages).toEqual([
            { channelId: marketplaceChannelId, messageId: 'old-listing-message' },
        ]);
        expect(guildClient.sentMessages).toHaveLength(1);

        const renewed = await adRepository.get(ad.id);
        expect(renewed.id.toString()).toBe(ad.id.toString());
        expect(renewed.status.toString()).toBe('active');
        expect(renewed.messageId).not.toBe('old-listing-message');
        expect(renewed.bumpedAt).not.toBeNull();
        expect(renewed.expiresAt).toBeNull();

        // Still exactly one row for this author — never a duplicate.
        const allForUser = await adRepository.findByUserId(userId);
        expect(allForUser).toHaveLength(1);
    });

    it('throws UnauthorizedAdRenewal when the clicking user is not the ad owner', async () => {
        const ownerId = '123456789012345678';
        const otherId = '987654321098765432';
        const ad = await pendingAd(ownerId);

        await expect(
            commandHandlerManager.handle(new RenewAd(ad.id, otherId, marketplaceChannelId)),
        ).rejects.toThrow(UnauthorizedAdRenewal);
    });

    it('throws AdNotEligibleForRenewal when the ad is not pending_renewal', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId); // plain active ad

        await expect(
            commandHandlerManager.handle(new RenewAd(ad.id, userId, marketplaceChannelId)),
        ).rejects.toThrow(AdNotEligibleForRenewal);
    });
});
