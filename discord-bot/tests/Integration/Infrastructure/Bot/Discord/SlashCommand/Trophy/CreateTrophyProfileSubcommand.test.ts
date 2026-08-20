import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { CreateTrophyProfileSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Trophy/CreateTrophyProfileSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { PrismaClient } from '@prisma/client';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

/**
 * M4.2 coverage: `CreateTrophyProfileSubcommand` was one of the worst
 * offenders with no `deferReply()` — the create path does two lookups
 * (existing user/PSN profile) plus a write before ever replying.
 *
 * The cheap synchronous URL-format check stays a plain (undeferred) reply,
 * since it never touches the database; defer only guards the part of the
 * handler that can actually be slow.
 */
describe('CreateTrophyProfileSubcommand Integration Test', () => {
    let createTrophyProfileSubcommand: CreateTrophyProfileSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        createTrophyProfileSubcommand = myContainer.get<CreateTrophyProfileSubcommand>(
            CreateTrophyProfileSubcommand,
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

    it('defers before writing to the database, then edits the deferred reply on success', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(
            {
                psnprofiles_url: 'https://psnprofiles.com/SomePsnUser',
            },
            userId,
        );

        await createTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain('SomePsnUser');
    });

    it('rejects an invalid URL with a plain (undeferred) reply, without ever deferring', async () => {
        const userId = '987654321098765432';
        const interaction = new FakeInteraction({ psnprofiles_url: 'not-a-url' }, userId);

        await createTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(0);
        expect(interaction.replyCalls.length).toBe(1);
        expect(interaction.replyCalls[0].content).toContain('Invalid PSNProfiles URL');
    });
});
