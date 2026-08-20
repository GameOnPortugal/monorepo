import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { BumpAdSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/BumpAdSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import type { GuildClient } from '../../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';

describe('BumpAdSubcommand Integration Test (M5.6)', () => {
    let bumpAdSubcommand: BumpAdSubcommand;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        bumpAdSubcommand = myContainer.get<BumpAdSubcommand>(BumpAdSubcommand);
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

    it('defers, bumps the ad and confirms in pt-PT', async () => {
        const userId = '123456789012345678';
        const messageId = 'listing-message';
        guildClient.registerMessage(messageId);
        const ad = await createAd(undefined, 'Test Ad', userId, '818447274266591243', messageId);
        const interaction = new FakeInteraction({ id: ad.id.toString() }, userId);

        await bumpAdSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls[0].content).toContain('renovado');

        const updated = await adRepository.get(ad.id);
        expect(updated.bumpedAt).not.toBeNull();
    });

    it('reports the 72h rate limit in pt-PT on a second bump', async () => {
        const userId = '123456789012345678';
        const messageId = 'listing-message';
        guildClient.registerMessage(messageId);
        const ad = await createAd(undefined, 'Test Ad', userId, '818447274266591243', messageId);

        await bumpAdSubcommand.handle(
            buildContext(new FakeInteraction({ id: ad.id.toString() }, userId)),
        );

        const secondInteraction = new FakeInteraction({ id: ad.id.toString() }, userId);
        await bumpAdSubcommand.handle(buildContext(secondInteraction));

        expect(secondInteraction.editReplyCalls[0].content).toContain('72 horas');
    });

    it('refuses a non-owner', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId, '818447274266591243');
        const interaction = new FakeInteraction({ id: ad.id.toString() }, otherUserId);

        await bumpAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toContain('Não tens permissão');
    });
});
