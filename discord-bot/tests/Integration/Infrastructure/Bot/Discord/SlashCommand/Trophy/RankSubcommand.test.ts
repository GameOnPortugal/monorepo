import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { MessageFlags } from 'discord.js';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { RankSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Trophy/RankSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { PrismaClient } from '@prisma/client';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

/**
 * M4.2 coverage: `RankSubcommand` was one of the worst offenders -- `GetRank`
 * can load up to 1000 profiles, which can easily outrun the 3s
 * interaction-ack window.
 */
describe('RankSubcommand Integration Test', () => {
    let rankSubcommand: RankSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        rankSubcommand = myContainer.get<RankSubcommand>(RankSubcommand);
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
            command: 'trophy',
            text: '',
            interaction: interaction.asChatInputCommandInteraction(),
        };
    }

    it('defers ephemerally before querying, then edits the deferred reply', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction({ type: 'lifetime' }, userId);

        await rankSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].embeds).toHaveLength(1);
    });

    it('stays ephemeral on the error path too', async () => {
        const userId = '987654321098765432';
        // `type` is required by the real slash command builder; omitting it
        // here makes `getString('type', true)` throw, exercising the catch
        // block without needing a mocking library.
        const interaction = new FakeInteraction({}, userId);

        await rankSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain(
            'error occurred while retrieving the trophy rankings',
        );
    });
});
