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
import { MAX_ACTIVE_ADS_PER_USER } from '../../../../../../../src/Domain/Marketplace/AdLimits';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import type { SafeImageFetcher } from '../../../../../../../src/Infrastructure/Media/SafeImageFetcher';
import type { MediaStorage } from '../../../../../../../src/Domain/Media/MediaStorage';
import { adPhotoMediaKey } from '../../../../../../../src/Domain/Media/MediaKey';

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

        // M5.5: the listing is now posted as a rich embed + buttons via
        // sendRichMessage, not a plain string via sendMessage.
        expect(guildClient.sentRichMessages.length).toBe(1);
        const [sent] = guildClient.sentRichMessages;
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
        expect(guildClient.sentRichMessages.length).toBe(0);

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
        expect(guildClient.sentRichMessages.length).toBe(1);
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

    // M5.10 — limits.

    it('refuses the 11th active ad with a clear message, and never posts it', async () => {
        const userId = '444455556666777788';
        for (let i = 0; i < MAX_ACTIVE_ADS_PER_USER; i++) {
            await createAd(undefined, `Existing ${i + 1}`, userId);
        }

        const interaction = new FakeInteraction(sellOptions, userId, invokingChannelId);
        await sellSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain(
            `${MAX_ACTIVE_ADS_PER_USER} anúncios activos`,
        );
        // Refused before ever touching Discord — no orphaned public message.
        expect(guildClient.sentRichMessages.length).toBe(0);
        expect(await adRepository.findByUserId(userId)).toHaveLength(MAX_ACTIVE_ADS_PER_USER);
    });

    it('allows the 10th ad — the limit is inclusive of exactly 10, not 9', async () => {
        const userId = '444455556666777799';
        for (let i = 0; i < MAX_ACTIVE_ADS_PER_USER - 1; i++) {
            await createAd(undefined, `Existing ${i + 1}`, userId);
        }

        const interaction = new FakeInteraction(sellOptions, userId, invokingChannelId);
        await sellSubcommand.handle(buildContext(interaction));

        expect(guildClient.sentRichMessages.length).toBe(1);
        expect(await adRepository.findByUserId(userId)).toHaveLength(MAX_ACTIVE_ADS_PER_USER);
    });

    // M5.11 — images.

    describe('with an image attachment', () => {
        let safeImageFetcher: SafeImageFetcher;
        let mediaStorage: MediaStorage;
        let originalFetch: SafeImageFetcher['fetch'];

        const ATTACHMENT_URL = 'https://cdn.discordapp.com/attachments/1/2/photo.png';

        beforeEach(() => {
            safeImageFetcher = myContainer.get<SafeImageFetcher>(TYPES.SafeImageFetcher);
            mediaStorage = myContainer.get<MediaStorage>(TYPES.MediaStorage);
            originalFetch = safeImageFetcher.fetch.bind(safeImageFetcher);
            // No mocking library (AGENT.md) — patch the shared SafeImageFetcher
            // singleton's one network-touching method for the duration of
            // this block, same technique DeleteAdSubcommand.test.ts already
            // uses on the shared AdRepository singleton.
            safeImageFetcher.fetch = async () => ({
                bytes: new TextEncoder().encode('fake-image-bytes'),
                contentType: 'image/png',
            });
        });

        afterEach(() => {
            safeImageFetcher.fetch = originalFetch;
        });

        it('re-hosts the photo through MediaStorage before posting — the initial embed never carries a cdn.discordapp.com URL', async () => {
            const userId = '222233334444555566';
            const interaction = new FakeInteraction(
                sellOptions,
                userId,
                invokingChannelId,
                undefined,
                {},
                {},
                { image: { contentType: 'image/png', url: ATTACHMENT_URL } },
            );

            await sellSubcommand.handle(buildContext(interaction));

            expect(guildClient.sentRichMessages.length).toBe(1);
            const [sent] = guildClient.sentRichMessages;
            const imageUrl = sent?.content.imageUrl;
            expect(imageUrl).toBeTruthy();
            expect(imageUrl).not.toContain('discordapp.com');

            const ads = await adRepository.findByUserId(userId);
            const [ad] = ads;
            expect(ad?.images).toEqual([imageUrl as string]);
            expect(ad?.images[0]).not.toContain('discordapp.com');

            // Actually landed in MediaStorage (MinIO in production, the
            // in-memory fake here) under the ad-photo key scheme — not just
            // a URL that happens to not say "discordapp.com".
            const key = adPhotoMediaKey(ad!.id.toString(), 0, 'png');
            expect(await mediaStorage.exists(key)).toBe(true);
        });

        it('rejects a non-image attachment before posting anything', async () => {
            const userId = '222233334444555577';
            const interaction = new FakeInteraction(
                sellOptions,
                userId,
                invokingChannelId,
                undefined,
                {},
                {},
                {
                    image: {
                        contentType: 'application/pdf',
                        url: 'https://cdn.discordapp.com/x.pdf',
                    },
                },
            );

            await sellSubcommand.handle(buildContext(interaction));

            expect(interaction.editReplyCalls[0].content).toBe('O ficheiro tem de ser uma imagem.');
            expect(guildClient.sentRichMessages.length).toBe(0);
            expect(await adRepository.findByUserId(userId)).toHaveLength(0);
        });
    });
});
