import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { WantedSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/WantedSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import type { GuildClient } from '../../../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import { CommunityChannels } from '../../../../../../../src/Domain/Community/CommunityChannels';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { MAX_ACTIVE_ADS_PER_USER } from '../../../../../../../src/Domain/Marketplace/AdLimits';
import type { SafeImageFetcher } from '../../../../../../../src/Infrastructure/Media/SafeImageFetcher';
import type { MediaStorage } from '../../../../../../../src/Domain/Media/MediaStorage';
import { adPhotoMediaKey } from '../../../../../../../src/Domain/Media/MediaKey';

/**
 * M5.7 — `/marketplace wanted` restores an old-bot feature (feature-gap G3).
 * Same post-then-persist shape as `SellSubcommand` (M5.1), so this suite
 * mirrors `SellSubcommand.test.ts`'s coverage rather than re-deriving it, and
 * adds the one thing that is actually specific to `wanted`: `adType` and the
 * blue embed colour `AdListingRenderer` already keys off it.
 */
describe('WantedSubcommand Integration Test', () => {
    let wantedSubcommand: WantedSubcommand;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        wantedSubcommand = myContainer.get<WantedSubcommand>(WantedSubcommand);
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

    const wantedOptions = {
        name: 'PS5 DualSense Controller',
        price: '40€',
        state: 'used_good',
        zone: 'Lisboa',
        dispatch: 'included',
    };

    it('creates an ad with adType wanted and the blue "Procura-se" embed', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(wantedOptions, userId, '999999999999999999');

        await wantedSubcommand.handle(buildContext(interaction));

        expect(guildClient.sentRichMessages.length).toBe(1);
        const [sent] = guildClient.sentRichMessages;
        expect(sent?.channel).toBe(CommunityChannels.MARKETPLACE);
        // WANTED_COLOR from AdListingRenderer.ts.
        expect(sent?.content.color).toBe(0x4199e7);
        expect(sent?.content.title).toContain('Procura-se');

        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(1);
        const [ad] = ads;
        if (!ad) throw new Error('expected an ad to have been persisted');
        expect(ad.adType).toBe('wanted');
        expect(ad.messageId).not.toBe('');
        expect(ad.messageId).not.toBeNull();
    });

    it('does not leave a half-written ad row when posting fails', async () => {
        const userId = '987654321098765432';
        const interaction = new FakeInteraction(wantedOptions, userId, '999999999999999999');
        guildClient.failNextSendWith = new Error('simulated Discord API failure');

        await wantedSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain('ref:');
        expect(guildClient.sentRichMessages.length).toBe(0);

        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(0);
    });

    it('replies with a confirmation link distinct from the sell copy', async () => {
        const userId = '111122223333444455';
        const interaction = new FakeInteraction(wantedOptions, userId, '999999999999999999');

        await wantedSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain('anúncio de procura');
    });

    it('M5.10 — shares the 10-active-ads limit pool with sell (not a separate cap)', async () => {
        const userId = '333344445555666677';
        for (let i = 0; i < MAX_ACTIVE_ADS_PER_USER; i++) {
            // adType 'sell', but counted against the same member.
            await createAd(undefined, `Existing ${i + 1}`, userId);
        }

        const interaction = new FakeInteraction(wantedOptions, userId, '999999999999999999');
        await wantedSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toContain(
            `${MAX_ACTIVE_ADS_PER_USER} anúncios activos`,
        );
        expect(guildClient.sentRichMessages.length).toBe(0);
    });

    describe('with an image attachment', () => {
        let safeImageFetcher: SafeImageFetcher;
        let mediaStorage: MediaStorage;
        let originalFetch: SafeImageFetcher['fetch'];

        const ATTACHMENT_URL = 'https://cdn.discordapp.com/attachments/1/2/reference.png';

        beforeEach(() => {
            safeImageFetcher = myContainer.get<SafeImageFetcher>(TYPES.SafeImageFetcher);
            mediaStorage = myContainer.get<MediaStorage>(TYPES.MediaStorage);
            originalFetch = safeImageFetcher.fetch.bind(safeImageFetcher);
            safeImageFetcher.fetch = async () => ({
                bytes: new TextEncoder().encode('fake-image-bytes'),
                contentType: 'image/png',
            });
        });

        afterEach(() => {
            safeImageFetcher.fetch = originalFetch;
        });

        it('re-hosts the reference photo through MediaStorage — never a cdn.discordapp.com URL on the posted embed', async () => {
            const userId = '333344445555666688';
            const interaction = new FakeInteraction(
                wantedOptions,
                userId,
                '999999999999999999',
                undefined,
                {},
                {},
                { image: { contentType: 'image/png', url: ATTACHMENT_URL } },
            );

            await wantedSubcommand.handle(buildContext(interaction));

            const [sent] = guildClient.sentRichMessages;
            const imageUrl = sent?.content.imageUrl;
            expect(imageUrl).toBeTruthy();
            expect(imageUrl).not.toContain('discordapp.com');

            const [ad] = await adRepository.findByUserId(userId);
            const key = adPhotoMediaKey(ad!.id.toString(), 0, 'png');
            expect(await mediaStorage.exists(key)).toBe(true);
        });
    });
});
