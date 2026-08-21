import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { ListAdsSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/ListAdsSubcommand';
import { MarketplaceComponentHandler } from '../../../../../../../src/Infrastructure/Bot/Discord/Component/Marketplace/MarketplaceComponentHandler';
import { EMBED_FIELD_VALUE_MAX_LENGTH } from '../../../../../../../src/Domain/Bot/embedLimits';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import FakeComponentInteraction from '../../../../../../Helper/FakeComponentInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import { MessageFlags } from 'discord.js';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import type { ComponentInteractionContext } from '../../../../../../../src/Domain/Bot/InteractionContext';

/**
 * M5.8: `ListAdsSubcommand` used to add one embed field per ad with a hard
 * cap of 25 and an "N omitted" footer — a user with more than 25 listings
 * could never see the rest. Replaced with real Prev/Next pagination
 * (`AdListPresenter`, following M7.6's `/trophy rank` shape), which this
 * suite exercises end-to-end: the initial page from `ListAdsSubcommand`, and
 * every subsequent page via `MarketplaceComponentHandler`'s `list-page`
 * button action.
 */
describe('ListAdsSubcommand Integration Test', () => {
    let listAdsSubcommand: ListAdsSubcommand;
    let componentHandler: MarketplaceComponentHandler;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        listAdsSubcommand = myContainer.get<ListAdsSubcommand>(ListAdsSubcommand);
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

    it('a user with 30 ads can page through all of them without ever exceeding the 25-field cap', async () => {
        const userId = '123456789012345678';
        for (let i = 0; i < 30; i++) {
            await createAd(
                undefined,
                `Item ${i + 1}`,
                userId,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                '',
                '',
            );
        }

        const interaction = new FakeInteraction({}, userId, undefined, undefined, {});
        await listAdsSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        // The whole command is ephemeral (M5.8 settles `/marketplace list` as
        // ephemeral going forward).
        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls.length).toBe(1);

        const firstReply = interaction.editReplyCalls[0];
        const firstFields = firstReply.embeds[0].data.fields;
        expect(firstFields.length).toBeLessThanOrEqual(25);
        expect(firstFields.length).toBe(10); // page size
        expect(firstReply.embeds[0].data.footer.text).toContain('Página 1 de 3');
        expect(firstReply.embeds[0].data.footer.text).toContain('30 anúncio');

        // The pagination row: Prev disabled on page 1, Next enabled.
        const [firstRow] = firstReply.components;
        const [prevButton1, nextButton1] = firstRow.components;
        expect(prevButton1.data.disabled).toBe(true);
        expect(nextButton1.data.disabled).toBe(false);

        // Click through every remaining page via the component handler,
        // collecting every ad name seen, to prove all 30 are reachable —
        // never just the first 25.
        const seenNames = new Set<string>();
        for (const field of firstFields) {
            seenNames.add(field.name as string);
        }

        let page = 2;
        for (; page <= 3; page++) {
            const clickInteraction = new FakeComponentInteraction(
                `mkt:list-page:${userId}:${page}:10`,
                userId,
            );
            await componentHandler.handle(componentContext(clickInteraction));

            expect(clickInteraction.updateCalls.length).toBe(1);
            const update = clickInteraction.updateCalls[0];
            const fields = update.embeds[0].data.fields;
            expect(fields.length).toBeLessThanOrEqual(25);
            for (const field of fields) {
                seenNames.add(field.name as string);
            }
        }

        // 30 distinct ads were seen across all 3 pages — nothing was skipped
        // or double-counted, which is what "paginated" actually has to mean.
        expect(seenNames.size).toBe(30);

        // The last page's Next button is disabled — there is nothing past it.
        const lastClick = new FakeComponentInteraction(`mkt:list-page:${userId}:3:10`, userId);
        await componentHandler.handle(componentContext(lastClick));
        const [lastRow] = lastClick.updateCalls[0].components;
        const [, nextButtonLast] = lastRow.components;
        expect(nextButtonLast.data.disabled).toBe(true);
    });

    it('truncates an over-long ad description instead of throwing', async () => {
        const userId = '987654321098765432';
        await createAd(
            undefined,
            'Long Description Item',
            userId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'x'.repeat(5000),
        );

        const interaction = new FakeInteraction({}, userId, undefined, undefined, {});

        // Must not throw despite the wildly over-long field value.
        await listAdsSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        const { embeds } = interaction.editReplyCalls[0];
        const field = embeds[0].data.fields[0];

        expect(field.value.length).toBeLessThanOrEqual(EMBED_FIELD_VALUE_MAX_LENGTH);
        expect(field.value.endsWith('…')).toBe(true);
    });

    it('shows status and a working link for each ad', async () => {
        const userId = '555555555555555555';
        await createAd(
            undefined,
            'Sold Item',
            userId,
            'channel-1',
            'message-1',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'sell',
        );

        const interaction = new FakeInteraction({}, userId, undefined, '333333333333333333', {});
        await listAdsSubcommand.handle(buildContext(interaction));

        const { embeds } = interaction.editReplyCalls[0];
        const field = embeds[0].data.fields[0];
        expect(field.value).toContain('🟢 Activo');
        expect(field.value).toContain(
            'https://discord.com/channels/333333333333333333/channel-1/message-1',
        );
    });

    it('stays ephemeral on the "no listings" path too (M0.3) — nothing here should broadcast into the channel', async () => {
        const userId = '111111111111111111';
        const interaction = new FakeInteraction({}, userId, undefined, undefined, {});

        await listAdsSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain('tens nenhum anúncio activo');
        // No public reply/followUp anywhere — the whole command stayed on
        // the single ephemeral deferred reply.
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.followUpCalls.length).toBe(0);
    });
});
