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
});
