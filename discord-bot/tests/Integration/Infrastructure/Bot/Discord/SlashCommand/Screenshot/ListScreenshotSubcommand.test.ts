import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { ListScreenshotSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Screenshot/ListScreenshotSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createScreenshot } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import { MessageFlags } from 'discord.js';

/**
 * M4.2 (defer) + M4.10 (output-size safety) coverage for `/screenshot list`.
 * It shares the `capFields` helper with `ListAdsSubcommand` (M4.10) so both
 * commands cap consistently — this one keeps its pre-existing 10-item
 * display limit instead of the shared 25-field Discord hard cap.
 */
describe('ListScreenshotSubcommand Integration Test', () => {
    let listScreenshotSubcommand: ListScreenshotSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        listScreenshotSubcommand =
            myContainer.get<ListScreenshotSubcommand>(ListScreenshotSubcommand);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('defers before querying, then edits the deferred reply', async () => {
        const userId = '123456789012345678';
        await createScreenshot(undefined, 'My Screenshot', userId);

        const interaction = new FakeInteraction({}, userId);

        await listScreenshotSubcommand.handle(interaction.asChatInputCommandInteraction());

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].embeds).toHaveLength(1);
    });

    it('caps the list at 10 screenshots and reports how many were left out', async () => {
        const userId = '987654321098765432';
        for (let i = 0; i < 15; i++) {
            await createScreenshot(undefined, `Screenshot ${i + 1}`, userId, undefined, `msg-${i}`);
        }

        const interaction = new FakeInteraction({}, userId);

        await listScreenshotSubcommand.handle(interaction.asChatInputCommandInteraction());

        const { embeds } = interaction.editReplyCalls[0];
        const fields = embeds[0].data.fields;

        expect(fields.length).toBeLessThanOrEqual(10);
        expect(fields).toHaveLength(10);
        expect(embeds[0].data.footer?.text).toContain('10 of 15');
    });
});
