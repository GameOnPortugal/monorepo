import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { CheckTrophyProfileSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Trophy/CheckTrophyProfileSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createTrophyProfile } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

/**
 * M4.2 coverage: `CheckTrophyProfileSubcommand` was one of the worst
 * offenders with no `deferReply()` at all — `GetProfile` is a database read
 * that can outrun the 3s interaction-ack window.
 */
describe('CheckTrophyProfileSubcommand Integration Test', () => {
    let checkTrophyProfileSubcommand: CheckTrophyProfileSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        checkTrophyProfileSubcommand = myContainer.get<CheckTrophyProfileSubcommand>(
            CheckTrophyProfileSubcommand,
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
            command: 'trophy',
            text: '',
            interaction: interaction.asChatInputCommandInteraction(),
        };
    }

    it('defers before querying, then edits the deferred reply with the profile embed', async () => {
        const userId = '123456789012345678';
        await createTrophyProfile(undefined, userId, 'SomePsnUser');

        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].embeds).toHaveLength(1);
    });

    it('defers, then edits with a not-found message rather than leaving the interaction hanging', async () => {
        const userId = '987654321098765432';
        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain(
            'have not registered your PSN profile',
        );
    });
});
