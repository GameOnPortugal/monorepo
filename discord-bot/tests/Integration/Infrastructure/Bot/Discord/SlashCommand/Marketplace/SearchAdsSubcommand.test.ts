import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { SearchAdsSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/SearchAdsSubcommand';
import { MarketplaceComponentHandler } from '../../../../../../../src/Infrastructure/Bot/Discord/Component/Marketplace/MarketplaceComponentHandler';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import FakeComponentInteraction from '../../../../../../Helper/FakeComponentInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import type { ComponentInteractionContext } from '../../../../../../../src/Domain/Bot/InteractionContext';
import { AdStatus } from '../../../../../../../src/Domain/Marketplace/AdStatus';

/**
 * M5.9 — the marketplace had no browse surface at all before this: only
 * `/marketplace list` (one member's own ads). Covers the DB-level filters
 * (`AdRepository.search()`), that a non-matching query returns nothing
 * (never every active ad — the failure mode of a filter that's silently a
 * no-op), and the pagination round trip through `SearchCriteriaStore`.
 */
describe('SearchAdsSubcommand Integration Test', () => {
    let searchAdsSubcommand: SearchAdsSubcommand;
    let componentHandler: MarketplaceComponentHandler;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        searchAdsSubcommand = myContainer.get<SearchAdsSubcommand>(SearchAdsSubcommand);
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

    function componentContext(interaction: FakeComponentInteraction): ComponentInteractionContext {
        return { kind: 'component', interaction: interaction.asButtonInteraction() };
    }

    it('filters active listings by keyword, zone, type, condition and max price — all in the database', async () => {
        const userId = '123456789012345678';
        // Matches every filter below.
        await createAd(
            undefined,
            'PS5 DualSense Controller',
            userId,
            undefined,
            undefined,
            'used_good',
            '40€',
            'Porto',
            undefined,
            undefined,
            'Great condition controller',
            'sell',
            undefined,
            undefined,
            AdStatus.active(),
            4000,
        );
        // Wrong keyword.
        await createAd(
            undefined,
            'Xbox Controller',
            userId,
            undefined,
            undefined,
            'used_good',
            '40€',
            'Porto',
            undefined,
            undefined,
            'A different pad entirely',
            'sell',
            undefined,
            undefined,
            AdStatus.active(),
            4000,
        );
        // Wrong type (wanted, not sell).
        await createAd(
            undefined,
            'PS5 DualSense Controller wanted',
            userId,
            undefined,
            undefined,
            'used_good',
            '40€',
            'Porto',
            undefined,
            undefined,
            'Looking for one',
            'wanted',
            undefined,
            undefined,
            AdStatus.active(),
            4000,
        );
        // Too expensive.
        await createAd(
            undefined,
            'PS5 DualSense Controller Elite',
            userId,
            undefined,
            undefined,
            'used_good',
            '999€',
            'Porto',
            undefined,
            undefined,
            'Premium controller',
            'sell',
            undefined,
            undefined,
            AdStatus.active(),
            99900,
        );
        // Not active (sold) — must never show up in a browse.
        await createAd(
            undefined,
            'PS5 DualSense Controller Sold',
            userId,
            undefined,
            undefined,
            'used_good',
            '40€',
            'Porto',
            undefined,
            undefined,
            'Great condition controller',
            'sell',
            undefined,
            undefined,
            AdStatus.sold(),
            4000,
        );

        const interaction = new FakeInteraction(
            {
                keyword: 'DualSense',
                zone: 'Porto',
                type: 'sell',
                condition: 'used_good',
            },
            userId,
            undefined,
            undefined,
            {},
            { max_price: 100 },
        );

        await searchAdsSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        const { embeds } = interaction.editReplyCalls[0];
        const fields = embeds[0].data.fields;
        expect(fields.length).toBe(1);
        expect(fields[0].name).toContain('PS5 DualSense Controller');
        expect(fields[0].value).not.toContain('Elite');
    });

    it('returns nothing — not every active ad — for a keyword that matches no listing', async () => {
        const userId = '123456789012345678';
        await createAd(undefined, 'PS5 DualSense Controller', userId);

        const interaction = new FakeInteraction({ keyword: 'nintendo-switch-lite' }, userId);

        await searchAdsSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain('Não foram encontrados anúncios');
        expect(interaction.editReplyCalls[0].embeds).toBeUndefined();
    });

    it('paginates results via the search-page component action', async () => {
        const userId = '123456789012345678';
        for (let i = 0; i < 15; i++) {
            await createAd(undefined, `Controller ${i + 1}`, userId);
        }

        const interaction = new FakeInteraction({}, userId, undefined, '333333333333333333', {});
        await searchAdsSubcommand.handle(buildContext(interaction));

        const firstReply = interaction.editReplyCalls[0];
        const firstFields = firstReply.embeds[0].data.fields;
        expect(firstFields.length).toBe(10);

        const [row] = firstReply.components;
        const nextButtonCustomId = row.components[1].data.custom_id as string;
        const token = nextButtonCustomId.split(':')[2];

        const clickInteraction = new FakeComponentInteraction(nextButtonCustomId, userId);
        await componentHandler.handle(componentContext(clickInteraction));

        expect(clickInteraction.updateCalls.length).toBe(1);
        const secondFields = clickInteraction.updateCalls[0].embeds[0].data.fields;
        expect(secondFields.length).toBe(5);

        // Same token round-trips to the same criteria (an empty search, in
        // this case) — not a new/different one.
        expect(token).toBeTruthy();
    });

    it('fails closed with an ephemeral prompt when the search token is unknown or expired', async () => {
        const userId = '123456789012345678';
        const clickInteraction = new FakeComponentInteraction(
            'mkt:search-page:doesnotexist:2',
            userId,
        );

        await componentHandler.handle(componentContext(clickInteraction));

        expect(clickInteraction.updateCalls.length).toBe(0);
        expect(clickInteraction.replyCalls.length + clickInteraction.followUpCalls.length).toBe(1);
    });
});
