import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { SellSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/SellSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import type { GuildClient } from '../../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import { CommunityChannels } from '../../../../../../../src/Domain/Community/CommunityChannels';
import { DiscordChannels } from '../../../../../../../src/Infrastructure/Community/Discord/DiscordChannels';

/**
 * M5.1: `/marketplace sell` used to post the listing via `interaction.reply()`
 * / `interaction.editReply()`, so it landed wherever the command was typed
 * (docs/known-issues.md #20 — 5 production ads in #chat, 3 elsewhere). It now
 * posts through `GuildClient` to the marketplace channel, and the interaction
 * reply becomes a private confirmation to the seller.
 */
describe('SellSubcommand Integration Test', () => {
    let sellSubcommand: SellSubcommand;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        sellSubcommand = myContainer.get<SellSubcommand>(SellSubcommand);
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

    const sellOptions = {
        name: 'PS5 DualSense Controller',
        price: '50€',
        state: 'new',
        zone: 'Porto',
        dispatch: 'included',
    };

    // A channel other than the marketplace one, to prove the listing does
    // not land wherever the command was invoked from.
    const invokingChannelId = '999999999999999999';

    it('posts the listing to the marketplace channel, not the invoking channel', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(sellOptions, userId, invokingChannelId);

        await sellSubcommand.handle(buildContext(interaction));

        expect(guildClient.sentMessages.length).toBe(1);
        const [sent] = guildClient.sentMessages;
        // The listing was sent through the GuildClient port to the
        // marketplace channel — never to `interaction.channelId`, which is
        // exactly what let ads land in #chat before M5.1.
        expect(sent?.channel).toBe(CommunityChannels.MARKETPLACE);

        // Nothing was ever posted directly as the interaction reply/followUp
        // itself — the only public artifact is the message sent through
        // GuildClient.
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.followUpCalls.length).toBe(0);

        // The interaction reply is a private confirmation, ephemeral from the
        // first ack.
        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls.length).toBe(1);
    });

    it('performs exactly one write, persisting the id of the message actually posted', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(sellOptions, userId, invokingChannelId);

        await sellSubcommand.handle(buildContext(interaction));

        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(1);
        const [ad] = ads;
        if (!ad) throw new Error('expected an ad to have been persisted');

        // The message_id it holds is non-empty and matches the message that
        // was actually posted to the marketplace channel, not a placeholder,
        // not the interaction id, and not the invoking channel. This is the
        // assertion that would have caught the production data corruption
        // (docs/known-issues.md #0/#20).
        expect(ad.messageId).not.toBe('');
        expect(ad.messageId).not.toBeNull();
        expect(ad.messageId).toBe('in-memory-1');
        expect(ad.channelId).toBe(DiscordChannels.MARKETPLACE);
        expect(ad.channelId).not.toBe(invokingChannelId);
    });

    it('does not leave a half-written ad row when posting to the marketplace channel fails', async () => {
        const userId = '987654321098765432';
        const interaction = new FakeInteraction(sellOptions, userId, invokingChannelId);
        guildClient.failNextSendWith = new Error('simulated Discord API failure');

        await sellSubcommand.handle(buildContext(interaction));

        // The user was told without leaking the raw error...
        expect(interaction.editReplyCalls.length).toBe(1);
        const errorReply = interaction.editReplyCalls[0];
        expect(errorReply.content).not.toContain('simulated Discord API failure');
        expect(errorReply.content).toContain('ref:');

        // ...nothing was posted to the marketplace channel...
        expect(guildClient.sentMessages.length).toBe(0);

        // ...and no ad row was ever written.
        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(0);
    });

    it('tells the user without leaking internals when the message posts but the write fails', async () => {
        const userId = '111122223333444455';
        // `name` is VARCHAR(191) at the database (prisma/migrations/20250416170150_init).
        // A value past that limit makes the write deterministically fail after
        // the message has already been posted, without needing a mocking
        // library or a flaky connection trick.
        const interaction = new FakeInteraction(
            { ...sellOptions, name: 'x'.repeat(500) },
            userId,
            invokingChannelId,
        );

        await sellSubcommand.handle(buildContext(interaction));

        // Exactly one message was posted to the marketplace channel...
        expect(guildClient.sentMessages.length).toBe(1);
        // ...the user was told via an ephemeral follow-up, not a second
        // reply, and the message does not leak the raw database error...
        expect(interaction.followUpCalls.length).toBe(1);
        const followUp = interaction.followUpCalls[0];
        expect(followUp.content).toContain('ref:');
        expect(followUp.content.toLowerCase()).not.toContain('prisma');
        expect(followUp.content.toLowerCase()).not.toContain('data too long');
        // The confirmation edit never happened — the follow-up replaces it.
        expect(interaction.editReplyCalls.length).toBe(0);

        // ...and no ad row exists for the failed write.
        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(0);
    });
});
