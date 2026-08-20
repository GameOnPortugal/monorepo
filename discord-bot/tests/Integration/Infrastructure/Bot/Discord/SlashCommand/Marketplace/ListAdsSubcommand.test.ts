import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { ListAdsSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/ListAdsSubcommand';
import { EMBED_FIELD_VALUE_MAX_LENGTH } from '../../../../../../../src/Domain/Bot/embedLimits';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import { MessageFlags } from 'discord.js';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

/**
 * Regression coverage for M4.10: `ListAdsSubcommand` used to add one embed
 * field per ad with no cap. Discord hard-rejects an embed with more than 25
 * fields (and one over the 1024-char per-field-value limit), so a user with
 * 26+ listings — or a single long description — broke the whole `/marketplace
 * list` command outright.
 */
describe('ListAdsSubcommand Integration Test', () => {
    let listAdsSubcommand: ListAdsSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        listAdsSubcommand = myContainer.get<ListAdsSubcommand>(ListAdsSubcommand);
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

    it('defers before querying, then edits the deferred reply with an embed capped at 25 fields', async () => {
        const userId = '123456789012345678';
        // Short warranty/description ('') keeps each field small enough that
        // the 25-field cap — not the 6000-char embed-total budget — is the
        // constraint this test is actually exercising.
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
        // The whole command is ephemeral now (M5.8 settles `/marketplace list`
        // as ephemeral going forward), so the defer itself carries the flag —
        // not just the error paths.
        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);

        const { embeds } = interaction.editReplyCalls[0];
        expect(embeds).toHaveLength(1);
        const embed = embeds[0];
        const fields = embed.data.fields;

        // Discord hard-rejects more than 25 fields — this is the cap that
        // stops the command from breaking outright for 26+ listings.
        expect(fields.length).toBeLessThanOrEqual(25);
        expect(fields.length).toBe(25);

        // The user is told how many listings were left out.
        const footerText = embed.data.footer?.text ?? '';
        expect(footerText).toContain('25 of 30');
        expect(footerText).toContain('5 omitted');
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

    it('stays ephemeral on the "no listings" path too (M0.3) — nothing here should broadcast into the channel', async () => {
        const userId = '111111111111111111';
        const interaction = new FakeInteraction({}, userId, undefined, undefined, {});

        await listAdsSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain("don't have any active listings");
        // No public reply/followUp anywhere — the whole command stayed on
        // the single ephemeral deferred reply.
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.followUpCalls.length).toBe(0);
    });
});
