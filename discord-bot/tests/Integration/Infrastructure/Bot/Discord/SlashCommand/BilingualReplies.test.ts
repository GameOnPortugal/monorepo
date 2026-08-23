import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { SoldAdSubcommand } from '../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/SoldAdSubcommand';
import { ListAdsSubcommand } from '../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/ListAdsSubcommand';
import { OptOutSubcommand } from '../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Privacy/OptOutSubcommand';
import { MarketplaceComponentHandler } from '../../../../../../src/Infrastructure/Bot/Discord/Component/Marketplace/MarketplaceComponentHandler';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../Helper/FakeInteraction';
import FakeComponentInteraction from '../../../../../Helper/FakeComponentInteraction';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { SlashCommandContext } from '../../../../../../src/Domain/Bot/SlashCommandContext';
import type { ComponentInteractionContext } from '../../../../../../src/Domain/Bot/InteractionContext';

const OWNER_ID = '123456789012345678';
const OTHER_ID = '987654321098765432';
const EN = 'en-GB';

/**
 * End-to-end coverage for the bilingual reply path: a member whose Discord
 * client is in English gets English, everyone else gets pt-PT — including
 * the member whose interaction carries no locale at all.
 *
 * The per-catalogue string content is covered by
 * `tests/Integration/Domain/Bot/I18n/`; what this file exercises is the
 * *wiring* — that each surface (a slash subcommand, an embed-building
 * presenter, a button click) actually reads `interaction.locale` and passes
 * the resolved locale down, rather than hardcoding one catalogue.
 */
describe('bilingual replies', () => {
    let soldAdSubcommand: SoldAdSubcommand;
    let listAdsSubcommand: ListAdsSubcommand;
    let optOutSubcommand: OptOutSubcommand;
    let componentHandler: MarketplaceComponentHandler;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        soldAdSubcommand = myContainer.get<SoldAdSubcommand>(SoldAdSubcommand);
        listAdsSubcommand = myContainer.get<ListAdsSubcommand>(ListAdsSubcommand);
        optOutSubcommand = myContainer.get<OptOutSubcommand>(OptOutSubcommand);
        componentHandler = myContainer.get<MarketplaceComponentHandler>(
            MarketplaceComponentHandler,
        );
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
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

    function english(options: Record<string, string | undefined>, userId = OWNER_ID) {
        return new FakeInteraction(
            options,
            userId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            EN,
        );
    }

    it('answers a success in the member’s own language', async () => {
        const ad = await createAd(undefined, 'Test Ad', OWNER_ID);
        const interaction = english({ id: ad.id.toString() });

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toBe('✅ Listing marked as sold.');
    });

    it('answers an error in the member’s own language', async () => {
        const ad = await createAd(undefined, 'Test Ad', OWNER_ID);
        const interaction = english({ id: ad.id.toString() }, OTHER_ID);

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toBe(
            'You do not have permission to mark this listing as sold.',
        );
    });

    it('still answers pt-PT when the interaction carries no locale at all', async () => {
        const ad = await createAd(undefined, 'Test Ad', OWNER_ID);
        // The 12th constructor argument is the locale; '' stands for "Discord
        // sent nothing", which must not fall through to English.
        const interaction = new FakeInteraction(
            { id: ad.id.toString() },
            OWNER_ID,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            '',
        );

        await soldAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls[0].content).toBe('✅ Anúncio marcado como vendido.');
    });

    it('localises the whole listing embed, not just the reply text', async () => {
        await createAd(undefined, 'Test Ad', OWNER_ID);
        const interaction = english({});

        await listAdsSubcommand.handle(buildContext(interaction));

        const { embeds, components } = interaction.editReplyCalls[0];
        const embed = embeds[0].data;

        expect(embed.title).toBe("test-user's listings");
        expect(embed.description).toBe('1 listing found');
        expect(embed.footer.text).toBe('Page 1 of 1 • 1 listing');
        expect(embed.fields[0].value).toContain('🏷️ For sale');
        expect(embed.fields[0].value).toContain('🟢 Active');
        expect(components[0].components[0].data.label).toBe('◀ Previous');
        expect(components[0].components[1].data.label).toBe('Next ▶');
    });

    it('localises a button click off a public, pt-PT-only listing', async () => {
        const ad = await createAd(undefined, 'Test Ad', OWNER_ID);
        // The listing itself is posted in pt-PT for the whole channel; the
        // ephemeral answer to a click on it is still per-member.
        const interaction = new FakeComponentInteraction(
            `mkt:sold:${ad.id.toString()}`,
            OWNER_ID,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            EN,
        );
        const context: ComponentInteractionContext = {
            kind: 'component',
            interaction: interaction.asButtonInteraction(),
        };

        await componentHandler.handle(context);

        expect(interaction.followUpCalls[0].content).toBe('✅ Listing marked as sold.');
    });

    it('localises commands outside the marketplace too', async () => {
        const interaction = english({});

        await optOutSubcommand.handle(buildContext(interaction));

        expect(interaction.replyCalls[0].content).toContain('You no longer appear publicly');
    });
});
