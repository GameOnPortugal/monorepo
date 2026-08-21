import { describe, test, expect } from 'bun:test';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { PrivacySlashCommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Privacy/PrivacySlashCommand';
import Logger from '../../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../../Helper/InMemoryLogger';

/**
 * Dispatch/builder coverage, same shape as ScreenshotSlashCommand.test.ts —
 * real database round trips for each subcommand live in
 * OptOutSubcommand.test.ts / OptInSubcommand.test.ts / DeleteDataSubcommand.test.ts.
 */
function createFakeInteraction(subcommand: string) {
    const calls: { method: string; payload: unknown }[] = [];

    return {
        calls,
        replied: false,
        deferred: false,
        options: {
            getSubcommand: () => subcommand,
        },
        reply: async function (this: any, payload: unknown) {
            calls.push({ method: 'reply', payload });
            this.replied = true;
        },
        followUp: async (payload: unknown) => {
            calls.push({ method: 'followUp', payload });
        },
        editReply: async (payload: unknown) => {
            calls.push({ method: 'editReply', payload });
        },
    };
}

describe('PrivacySlashCommand', () => {
    test('getName() is "privacy"', () => {
        const logger = new Logger([new InMemoryLogger()]);
        const command = new PrivacySlashCommand(logger, {} as any, {} as any, {} as any);

        expect(command.getName()).toBe('privacy');
    });

    test('routes each subcommand name to its handler', async () => {
        const logger = new Logger([new InMemoryLogger()]);
        const calls: string[] = [];
        const spy = (name: string) => ({
            handle: async () => {
                calls.push(name);
            },
        });

        const command = new PrivacySlashCommand(
            logger,
            spy('opt-out') as any,
            spy('opt-in') as any,
            spy('delete-data') as any,
        );

        for (const subcommand of ['opt-out', 'opt-in', 'delete-data']) {
            const interaction = createFakeInteraction(subcommand);
            await command.handle({
                kind: 'chat-input',
                channel_id: 'chan',
                command: 'privacy',
                text: '',
                interaction: interaction as unknown as ChatInputCommandInteraction,
            });
        }

        expect(calls).toEqual(['opt-out', 'opt-in', 'delete-data']);
    });

    test('an unhandled error in a subcommand results in a properly-flagged ephemeral reply', async () => {
        const logger = new Logger([new InMemoryLogger()]);
        const failingSubcommand = {
            handle: async () => {
                throw new Error('boom');
            },
        };
        const noopSubcommand = { handle: async () => {} };

        const command = new PrivacySlashCommand(
            logger,
            failingSubcommand as any,
            noopSubcommand as any,
            noopSubcommand as any,
        );

        const interaction = createFakeInteraction('opt-out');
        await command.handle({
            kind: 'chat-input',
            channel_id: 'chan',
            command: 'privacy',
            text: '',
            interaction: interaction as unknown as ChatInputCommandInteraction,
        });

        expect(interaction.calls).toHaveLength(1);
        const { method, payload } = interaction.calls[0]!;
        expect(method).toBe('reply');
        expect(payload).toMatchObject({ flags: MessageFlags.Ephemeral });
        expect((payload as { content: string }).content).toContain(
            'Ocorreu um erro ao processar o comando',
        );
    });

    describe('builder()', () => {
        test('is guild-only, guild-install, and explicitly open to every member', () => {
            const logger = new Logger([new InMemoryLogger()]);
            const noopSubcommand = { handle: async () => {} };
            const command = new PrivacySlashCommand(
                logger,
                noopSubcommand as any,
                noopSubcommand as any,
                noopSubcommand as any,
            );

            const json = command.builder().toJSON();

            expect(json.name).toBe('privacy');
            expect(json.contexts).toEqual([0]); // InteractionContextType.Guild
            expect(json.integration_types).toEqual([0]); // ApplicationIntegrationType.GuildInstall
            expect(json.default_member_permissions).toBeNull();
            expect(json.options?.map((o) => o.name)).toEqual(['opt-out', 'opt-in', 'delete-data']);
        });
    });
});
