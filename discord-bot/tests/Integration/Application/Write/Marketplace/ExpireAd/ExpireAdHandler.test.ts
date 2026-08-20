import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { ExpireAd } from '../../../../../../src/Application/Write/Marketplace/ExpireAd/ExpireAd';
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository';
import RecordNotFound from '../../../../../../src/Domain/RecordNotFound.ts';
import type { GuildClient } from '../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';

describe('ExpireAdHandler Integration Test', () => {
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

    it('removes the channel message and moves an active ad to expired, keeping the row (never deletes it)', async () => {
        const channelId = '818447274266591243';
        const messageId = 'listing-message-1';
        guildClient.registerMessage(messageId);

        const ad = await createAd(undefined, 'Old Controller', undefined, channelId, messageId);
        await commandHandlerManager.handle(new ExpireAd(ad.id, 'orphaned-no-message'));

        expect(guildClient.deletedMessages).toEqual([{ channelId, messageId }]);

        // Still readable through the repository — never deleted, just expired.
        const stillThere = await adRepository.get(ad.id);
        expect(stillThere.status.toString()).toBe('expired');
        expect(stillThere.deletedAt).toBeNull();
    });

    it('expires a pending_renewal ad the same way (no-response path)', async () => {
        const channelId = '818447274266591243';
        const messageId = 'listing-message-2';
        guildClient.registerMessage(messageId);

        const ad = await createAd(
            undefined,
            'Old Controller',
            undefined,
            channelId,
            messageId,
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

        await commandHandlerManager.handle(new ExpireAd(ad.id, 'no-response'));

        const stillThere = await adRepository.get(ad.id);
        expect(stillThere.status.toString()).toBe('expired');
    });

    it('skips the Discord delete entirely for an orphaned row with an empty message_id', async () => {
        const ad = await createAd(undefined, 'Orphan Ad', undefined, '818447274266591243', '');

        await commandHandlerManager.handle(new ExpireAd(ad.id, 'orphaned-no-message'));

        expect(guildClient.deletedMessages).toEqual([]);
        const stillThere = await adRepository.get(ad.id);
        expect(stillThere.status.toString()).toBe('expired');
    });

    it('is idempotent: expiring an already-expired ad is a no-op, not an error', async () => {
        const ad = await createAd(
            undefined,
            'Test Ad',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.expired(),
        );

        await expect(
            commandHandlerManager.handle(new ExpireAd(ad.id, 'message-vanished')),
        ).resolves.toBeUndefined();

        // guildClient never touched — nothing to do for an already-expired ad.
        expect(guildClient.deletedMessages).toEqual([]);
    });

    it('throws RecordNotFound for an unknown or soft-deleted ad', async () => {
        await expect(
            commandHandlerManager.handle(new ExpireAd(AdId.generate(), 'message-vanished')),
        ).rejects.toThrow(RecordNotFound);
    });
});
