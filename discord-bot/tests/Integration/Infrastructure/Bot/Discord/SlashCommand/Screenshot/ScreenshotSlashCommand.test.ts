import { describe, test, expect } from 'bun:test';
import { MessageFlags } from 'discord.js';
import { ScreenshotSlashCommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Screenshot/ScreenshotSlashCommand';
import Logger from '../../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../../Helper/InMemoryLogger';

/**
 * Regression coverage for M0.3 (B2): `interaction.reply(string, { flags })`
 * is not a valid discord.js v14 signature — the options object is silently
 * dropped, so an "ephemeral" error is posted publicly for everyone to see.
 * The outer catch in ScreenshotSlashCommand.handle() used to do exactly
 * that; it must use the object form so the ephemeral flag actually reaches
 * discord.js.
 *
 * This also exercises M0.4 (B3): the outer catch fires *after* a subcommand
 * may already have replied, so it must go through safeReply() rather than
 * calling interaction.reply() directly.
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

describe('ScreenshotSlashCommand', () => {
    test('an unhandled error in a subcommand results in a properly-flagged ephemeral reply', async () => {
        const failingSubcommand = {
            handle: async () => {
                throw new Error('boom');
            },
        };
        const noopSubcommand = { handle: async () => {} };
        const logger = new Logger([new InMemoryLogger()]);

        const command = new ScreenshotSlashCommand(
            logger,
            failingSubcommand as any,
            noopSubcommand as any,
            noopSubcommand as any,
        );

        const interaction = createFakeInteraction('create');

        await command.handle({
            channel_id: 'chan',
            command: 'screenshot',
            text: '',
            interaction,
        });

        expect(interaction.calls).toHaveLength(1);
        const { method, payload } = interaction.calls[0]!;

        // Must be the object-form call (M0.3): a bare string content with a
        // second positional options argument is not valid discord.js v14 and
        // would post this message publicly instead of ephemerally.
        expect(method).toBe('reply');
        expect(payload).toMatchObject({ flags: MessageFlags.Ephemeral });
        expect((payload as { content: string }).content).toContain(
            'error processing your screenshot command',
        );
    });

    test('does not throw InteractionAlreadyReplied when the subcommand already replied before throwing', async () => {
        const interaction = createFakeInteraction('create');

        const partiallyFailingSubcommand = {
            handle: async (i: typeof interaction) => {
                await i.reply({ content: 'partial success' });
                throw new Error('failed after replying');
            },
        };
        const noopSubcommand = { handle: async () => {} };
        const logger = new Logger([new InMemoryLogger()]);

        const command = new ScreenshotSlashCommand(
            logger,
            partiallyFailingSubcommand as any,
            noopSubcommand as any,
            noopSubcommand as any,
        );

        let thrown: unknown = null;
        try {
            await command.handle({
                channel_id: 'chan',
                command: 'screenshot',
                text: '',
                interaction,
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeNull();
        expect(interaction.calls.map((c) => c.method)).toEqual(['reply', 'followUp']);
    });
});
