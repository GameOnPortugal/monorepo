import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { SoldAdSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/SoldAdSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import { AdStatus } from '../../../../../../../src/Domain/Marketplace/AdStatus';
import { MessageFlags } from 'discord.js';
import type { GuildClient } from '../../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';

const MANAGE_MESSAGES_BIT = '8192';

describe('SoldAdSubcommand Integration Test (M5.6)', () => {
    let soldAdSubcommand: SoldAdSubcommand;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        soldAdSubcommand = myContainer.get<SoldAdSubcommand>(SoldAdSubcommand);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function buildContext(interaction: FakeInteraction): SlashCommandContext {
        return {
            kind: 'chat-input',
            channel_id: interaction.channelId,
            command: 'marketplace',
            text: '',
            interaction: interaction.asChatInputCommandInteraction(),
        };
    }

    it('defers, marks the ad sold and confirms in pt-PT', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId);
        const interaction = new FakeInteraction({ id: ad.id.toString() }, userId);

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls[0].content).toContain('vendido');

        const updated = await adRepository.get(ad.id);
        expect(updated.status.equals(AdStatus.sold())).toBe(true);
    });

    it('refuses a non-owner, non-admin caller', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);
        const interaction = new FakeInteraction({ id: ad.id.toString() }, otherUserId);

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toContain('Não tens permissão');
        const untouched = await adRepository.get(ad.id);
        expect(untouched.status.equals(AdStatus.active())).toBe(true);
    });

    it('allows an admin to mark someone else’s ad sold', async () => {
        const ownerId = '123456789012345678';
        const adminId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);
        const interaction = new FakeInteraction(
            { id: ad.id.toString() },
            adminId,
            undefined,
            undefined,
            {},
            {},
            {},
            '',
            'admin',
            'fake-interaction-1',
            MANAGE_MESSAGES_BIT,
        );

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toContain('vendido');
        const updated = await adRepository.get(ad.id);
        expect(updated.status.equals(AdStatus.sold())).toBe(true);
    });

    it('reports a clean message when the ad does not exist', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(
            { id: '00000000-0000-0000-0000-000000000000' },
            userId,
        );

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toBe('Anúncio não encontrado.');
    });
});
