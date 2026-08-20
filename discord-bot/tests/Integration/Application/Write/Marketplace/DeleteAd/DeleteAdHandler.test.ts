import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { DeleteAd } from '../../../../../../src/Application/Write/Marketplace/DeleteAd/DeleteAd';
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository';
import { UnauthorizedAdDeletion } from '../../../../../../src/Domain/Marketplace/UnauthorizedAdDeletion';
import RecordNotFound from '../../../../../../src/Domain/RecordNotFound.ts';
import type { GuildClient } from '../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import { CommunityChannels } from '../../../../../../src/Domain/Community/CommunityChannels';

describe('DeleteAdHandler Integration Test', () => {
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

    it('should delete an ad when user is the owner', async () => {
        // Arrange
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId);
        const command = new DeleteAd(ad.id, userId);

        // Act
        await commandHandlerManager.handle(command);

        // Assert
        await expect(adRepository.get(ad.id)).rejects.toThrow(RecordNotFound);
    });

    it('should throw RecordNotFound when ad does not exist', async () => {
        // Arrange
        const adId = AdId.generate();
        const userId = '123456789012345678';
        const command = new DeleteAd(adId, userId);

        // Act & Assert
        await expect(commandHandlerManager.handle(command)).rejects.toThrow(RecordNotFound);
    });

    it('should throw UnauthorizedAdDeletion when user is not the owner', async () => {
        // Arrange
        const ownerId = '123456789012345678';
        const differentUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);
        const command = new DeleteAd(ad.id, differentUserId);

        // Act & Assert
        await expect(commandHandlerManager.handle(command)).rejects.toThrow(UnauthorizedAdDeletion);
    });

    // M5.10 — admin override.

    it('lets a non-owner with isAdmin=true delete the ad', async () => {
        const ownerId = '123456789012345678';
        const adminId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);

        await commandHandlerManager.handle(new DeleteAd(ad.id, adminId, true));

        await expect(adRepository.get(ad.id)).rejects.toThrow(RecordNotFound);
    });

    it('still refuses a non-owner without isAdmin, even though the flag exists', async () => {
        const ownerId = '123456789012345678';
        const differentUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);

        await expect(
            commandHandlerManager.handle(new DeleteAd(ad.id, differentUserId, false)),
        ).rejects.toThrow(UnauthorizedAdDeletion);
    });

    // M5.2: delete removes the Discord message.

    it('deletes the Discord message the ad was posted as', async () => {
        const userId = '123456789012345678';
        const channelId = '818447274266591243';
        const messageId = 'posted-listing-message-1';
        guildClient.registerMessage(messageId);

        const ad = await createAd(undefined, 'Test Ad', userId, channelId, messageId);
        await commandHandlerManager.handle(new DeleteAd(ad.id, userId));

        expect(guildClient.deletedMessages).toEqual([{ channelId, messageId }]);
        // The message is actually gone from the fake's backing store, not
        // just recorded as "asked to delete" — getMessageUrl looks it up the
        // same way a real Discord GET would. The fake's message store is not
        // partitioned by channel, so any CommunityChannels value works here.
        await expect(
            guildClient.getMessageUrl(CommunityChannels.MARKETPLACE, messageId),
        ).rejects.toThrow();
    });

    it('succeeds when the Discord message is already gone (tolerates a 404)', async () => {
        const userId = '123456789012345678';
        const channelId = '818447274266591243';
        // Never registered with the fake — mirrors a message a moderator
        // already deleted by hand, or one that a real DiscordGuildClient
        // would get back a 404/Unknown Message for.
        const messageId = 'already-deleted-message';

        const ad = await createAd(undefined, 'Test Ad', userId, channelId, messageId);

        await expect(
            commandHandlerManager.handle(new DeleteAd(ad.id, userId)),
        ).resolves.toBeUndefined();
        await expect(adRepository.get(ad.id)).rejects.toThrow(RecordNotFound);
    });

    it('skips the Discord delete entirely for a row with an empty message_id, and still deletes the row', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId, '818447274266591243', '');

        await commandHandlerManager.handle(new DeleteAd(ad.id, userId));

        // Nothing was ever asked of GuildClient — there was no message to
        // delete (28 production rows are exactly this shape, from the M0.1
        // write-back bug).
        expect(guildClient.deletedMessages).toEqual([]);
        await expect(adRepository.get(ad.id)).rejects.toThrow(RecordNotFound);
    });

    it('soft-deletes the row: it still exists with deleted_at set, but is no longer readable through the repository', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId);

        await commandHandlerManager.handle(new DeleteAd(ad.id, userId));

        // The read path (cross-cutting rule 2) treats it as gone...
        await expect(adRepository.get(ad.id)).rejects.toThrow(RecordNotFound);
        expect(await adRepository.findByUserId(userId)).toEqual([]);

        // ...but the row itself is still physically present, never
        // hard-deleted — queried directly, bypassing the repository's
        // deleted_at filter.
        const rawRow = await ormClient.ad.findUnique({ where: { id: ad.id.toString() } });
        expect(rawRow).not.toBeNull();
        expect(rawRow?.deleted_at).not.toBeNull();
        expect(rawRow?.status).toBe('deleted');
    });
});
