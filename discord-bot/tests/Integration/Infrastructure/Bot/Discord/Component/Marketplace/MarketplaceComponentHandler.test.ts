import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { MarketplaceComponentHandler } from '../../../../../../../src/Infrastructure/Bot/Discord/Component/Marketplace/MarketplaceComponentHandler';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeComponentInteraction from '../../../../../../Helper/FakeComponentInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import { AdStatus } from '../../../../../../../src/Domain/Marketplace/AdStatus';
import { buildCustomId } from '../../../../../../../src/Domain/Bot/CustomId';
import type { GuildClient } from '../../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import type {
    ComponentInteractionContext,
    ModalInteractionContext,
} from '../../../../../../../src/Domain/Bot/InteractionContext';

/** Discord's ManageMessages permission bit, as the raw HTTP bitfield string isGuildAdmin() reads. */
const MANAGE_MESSAGES_BIT = '8192';
const MARKETPLACE_CHANNEL_ID = '818447274266591243';

describe('MarketplaceComponentHandler Integration Test (M5.5/M5.6)', () => {
    let handler: MarketplaceComponentHandler;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        handler = myContainer.get<MarketplaceComponentHandler>(MarketplaceComponentHandler);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function componentContext(interaction: FakeComponentInteraction): ComponentInteractionContext {
        return { kind: 'component', interaction: interaction.asButtonInteraction() };
    }

    function modalContext(interaction: FakeComponentInteraction): ModalInteractionContext {
        return { kind: 'modal', interaction: interaction.asModalSubmitInteraction() };
    }

    it('claims the mkt namespace', () => {
        expect(handler.getNamespace()).toBe('mkt');
    });

    describe('contact', () => {
        it('replies ephemerally with a profile link to the seller', async () => {
            const ownerId = '123456789012345678';
            const ad = await createAd(undefined, 'Test Ad', ownerId);
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'contact', ad.id.toString()),
                '999999999999999999',
            );

            await handler.handle(componentContext(interaction));

            expect(interaction.replyCalls.length).toBe(1);
            expect(interaction.replyCalls[0].content).toContain(`discord.com/users/${ownerId}`);
        });
    });

    describe('sold', () => {
        it('refuses a non-owner, non-admin clicker', async () => {
            const ownerId = '123456789012345678';
            const otherUserId = '987654321098765432';
            const messageId = 'listing-message';
            guildClient.registerMessage(messageId);
            const ad = await createAd(
                undefined,
                'Test Ad',
                ownerId,
                MARKETPLACE_CHANNEL_ID,
                messageId,
            );
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'sold', ad.id.toString()),
                otherUserId,
            );

            await handler.handle(componentContext(interaction));

            expect(interaction.deferUpdateCalls.length).toBe(1);
            expect(interaction.followUpCalls.length).toBe(1);
            expect(interaction.followUpCalls[0].content).toContain('Não tens permissão');

            const untouched = await adRepository.get(ad.id);
            expect(untouched.status.equals(AdStatus.active())).toBe(true);
            expect(guildClient.deletedMessages).toEqual([]);
        });

        it('allows the owner to mark it sold, removing the posted message', async () => {
            const ownerId = '123456789012345678';
            const messageId = 'listing-message';
            guildClient.registerMessage(messageId);
            const ad = await createAd(
                undefined,
                'Test Ad',
                ownerId,
                MARKETPLACE_CHANNEL_ID,
                messageId,
            );
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'sold', ad.id.toString()),
                ownerId,
            );

            await handler.handle(componentContext(interaction));

            expect(interaction.followUpCalls[0].content).toContain('vendido');
            const updated = await adRepository.get(ad.id);
            expect(updated.status.equals(AdStatus.sold())).toBe(true);
            expect(guildClient.deletedMessages).toEqual([
                { channelId: MARKETPLACE_CHANNEL_ID, messageId },
            ]);
        });

        it('allows an admin (ManageMessages) to mark someone else’s ad sold', async () => {
            const ownerId = '123456789012345678';
            const adminId = '987654321098765432';
            const messageId = 'listing-message';
            guildClient.registerMessage(messageId);
            const ad = await createAd(
                undefined,
                'Test Ad',
                ownerId,
                MARKETPLACE_CHANNEL_ID,
                messageId,
            );
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'sold', ad.id.toString()),
                adminId,
                '222222222222222222',
                '333333333333333333',
                'admin-user',
                MANAGE_MESSAGES_BIT,
            );

            await handler.handle(componentContext(interaction));

            expect(interaction.followUpCalls[0].content).toContain('vendido');
            const updated = await adRepository.get(ad.id);
            expect(updated.status.equals(AdStatus.sold())).toBe(true);
        });
    });

    describe('bump', () => {
        it('reposts on the first bump, and refuses a second one inside 72h', async () => {
            const ownerId = '123456789012345678';
            const messageId = 'listing-message';
            guildClient.registerMessage(messageId);
            const ad = await createAd(
                undefined,
                'Test Ad',
                ownerId,
                MARKETPLACE_CHANNEL_ID,
                messageId,
            );
            const customId = buildCustomId('mkt', 'bump', ad.id.toString());

            const first = new FakeComponentInteraction(customId, ownerId);
            await handler.handle(componentContext(first));

            expect(first.followUpCalls[0].content).toContain('renovado');
            expect(guildClient.sentRichMessages.length).toBe(1);

            const second = new FakeComponentInteraction(customId, ownerId);
            await handler.handle(componentContext(second));

            expect(second.followUpCalls[0].content).toContain('72 horas');
            // Still only the one repost from the first bump.
            expect(guildClient.sentRichMessages.length).toBe(1);
        });

        it('refuses a non-owner', async () => {
            const ownerId = '123456789012345678';
            const otherUserId = '987654321098765432';
            const ad = await createAd(undefined, 'Test Ad', ownerId, MARKETPLACE_CHANNEL_ID);
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'bump', ad.id.toString()),
                otherUserId,
            );

            await handler.handle(componentContext(interaction));

            expect(interaction.followUpCalls[0].content).toContain('Não tens permissão');
            expect(guildClient.sentRichMessages.length).toBe(0);
        });
    });

    describe('edit-submit (modal)', () => {
        it('updates the ad and re-renders the message for the owner', async () => {
            const ownerId = '123456789012345678';
            const messageId = 'listing-message';
            guildClient.registerMessage(messageId);
            const ad = await createAd(
                undefined,
                'Test Ad',
                ownerId,
                MARKETPLACE_CHANNEL_ID,
                messageId,
            );
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'edit-submit', ad.id.toString()),
                ownerId,
                '222222222222222222',
                '333333333333333333',
                'test-user',
                '0',
                { price: '80€', description: 'Descrição actualizada' },
            );

            await handler.handle(modalContext(interaction));

            expect(interaction.deferReplyCalls.length).toBe(1);
            expect(interaction.editReplyCalls[0].content).toContain('actualizado');

            const updated = await adRepository.get(ad.id);
            expect(updated.price).toBe('80€');
            expect(updated.description).toBe('Descrição actualizada');
            expect(guildClient.editedRichMessages.length).toBe(1);
        });

        it('refuses a non-owner submission', async () => {
            const ownerId = '123456789012345678';
            const otherUserId = '987654321098765432';
            const ad = await createAd(undefined, 'Test Ad', ownerId, MARKETPLACE_CHANNEL_ID);
            const interaction = new FakeComponentInteraction(
                buildCustomId('mkt', 'edit-submit', ad.id.toString()),
                otherUserId,
                '222222222222222222',
                '333333333333333333',
                'test-user',
                '0',
                { price: '80€', description: 'x' },
            );

            await handler.handle(modalContext(interaction));

            expect(interaction.editReplyCalls[0].content).toContain('Não tens permissão');
            const untouched = await adRepository.get(ad.id);
            expect(untouched.price).not.toBe('80€');
        });
    });
});
