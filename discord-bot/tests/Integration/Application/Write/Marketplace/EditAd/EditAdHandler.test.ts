import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { EditAd } from '../../../../../../src/Application/Write/Marketplace/EditAd/EditAd';
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

const MARKETPLACE_CHANNEL_ID = '818447274266591243';

/**
 * M5.6: `EditAdHandler` amends price/description and re-renders the posted
 * listing message in place (not a delete-then-repost, unlike `bump`).
 */
describe('EditAdHandler Integration Test', () => {
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

    it('updates price/description and re-renders the posted message in place', async () => {
        const userId = '123456789012345678';
        const messageId = 'posted-listing-1';
        guildClient.registerMessage(messageId);
        const ad = await createAd(undefined, 'Test Ad', userId, MARKETPLACE_CHANNEL_ID, messageId);

        await commandHandlerManager.handle(new EditAd(ad.id, userId, '75€', 'Novo texto'));

        const updated = await adRepository.get(ad.id);
        expect(updated.price).toBe('75€');
        expect(updated.priceCents).toBe(7500);
        expect(updated.description).toBe('Novo texto');

        // Edited in place — no delete, no repost, unlike bump.
        expect(guildClient.deletedMessages).toEqual([]);
        expect(guildClient.sentRichMessages).toEqual([]);
        expect(guildClient.editedRichMessages.length).toBe(1);
        const [edited] = guildClient.editedRichMessages;
        expect(edited?.channelId).toBe(MARKETPLACE_CHANNEL_ID);
        expect(edited?.messageId).toBe(messageId);
        // The embed footer still carries the ad id (M5.5) after an edit.
        expect(edited?.content.footerText).toContain(ad.id.toString());
        expect(edited?.content.description).toContain('Novo texto');
    });

    it('leaves priceCents null when the price cannot be parsed', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId, MARKETPLACE_CHANNEL_ID);

        await commandHandlerManager.handle(new EditAd(ad.id, userId, 'a combinar', ''));

        const updated = await adRepository.get(ad.id);
        expect(updated.price).toBe('a combinar');
        expect(updated.priceCents).toBeNull();
    });

    it('refuses a non-owner', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);

        await expect(
            commandHandlerManager.handle(new EditAd(ad.id, otherUserId, '10€', 'x')),
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
            commandHandlerManager.handle(new EditAd(ad.id, userId, '10€', 'x')),
        ).rejects.toThrow(AdNotActive);
    });

    it('throws RecordNotFound for a non-existent ad', async () => {
        await expect(
            commandHandlerManager.handle(
                new EditAd(AdId.generate(), '123456789012345678', '10€', 'x'),
            ),
        ).rejects.toThrow(RecordNotFound);
    });
});
