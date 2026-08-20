import { describe, test, expect } from 'bun:test';
import type { ChatInputCommandInteraction } from 'discord.js';
import { CreateScreenshotSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Screenshot/CreateScreenshotSubcommand';
import Logger from '../../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../../Helper/InMemoryLogger';
import { Screenshot } from '../../../../../../../src/Domain/Screenshot/Screenshot';
import { ScreenshotId } from '../../../../../../../src/Domain/Screenshot/ScreenshotId';

/**
 * Regression coverage for M0.2 (A1): a member can name a screenshot
 * "@everyone" and, before this fix, the bot echoed that name straight into
 * message *content* with no `allowedMentions` set — discord.js parses
 * mentions out of raw content by default, so this pinged the whole server.
 *
 * The fix is layered: `DiscordBot.ts` now constructs its Client with
 * `allowedMentions: { parse: [] }` globally, and this call site additionally
 * sets it explicitly on the reply that echoes the user-supplied name, so the
 * protection does not depend solely on the global default.
 *
 * The command handler manager is hand-rolled here (not the real DI
 * container) so this test exercises only the discord.js reply payload, not
 * the database/network-backed CreateScreenshot write path, which is already
 * covered by CreateScreenshotHandler.test.ts.
 */
function createFakeCommandHandlerManager(screenshotId: ScreenshotId) {
    return {
        handle: async () =>
            new Screenshot(
                screenshotId,
                '@everyone',
                'user-1',
                'chan-1',
                'interaction-1',
                'pc',
                'https://example.com/screenshot.png',
                'deadbeef',
                new Date(),
                new Date(),
            ),
    } as any;
}

function createFakeInteraction() {
    const calls: { method: string; payload: unknown }[] = [];
    const fakeMessage = { react: async () => {} };

    return {
        calls,
        replied: false,
        deferred: false,
        user: { id: 'user-1', username: 'attacker' },
        channelId: 'chan-1',
        id: 'interaction-1',
        options: {
            getAttachment: () => ({
                contentType: 'image/png',
                url: 'https://example.com/screenshot.png',
            }),
            getString: (name: string) => (name === 'name' ? '@everyone' : 'pc'),
        },
        reply: async function (this: any, payload: unknown) {
            calls.push({ method: 'reply', payload });
            this.replied = true;
            return fakeMessage;
        },
        deferReply: async function (this: any, payload?: unknown) {
            calls.push({ method: 'deferReply', payload });
            this.deferred = true;
        },
        editReply: async function (this: any, payload: unknown) {
            calls.push({ method: 'editReply', payload });
            return fakeMessage;
        },
        followUp: async (payload: unknown) => {
            calls.push({ method: 'followUp', payload });
        },
    };
}

describe('CreateScreenshotSubcommand', () => {
    test('a screenshot named @everyone cannot produce a real mention', async () => {
        const screenshotId = ScreenshotId.generate();
        const logger = new Logger([new InMemoryLogger()]);
        const subcommand = new CreateScreenshotSubcommand(
            createFakeCommandHandlerManager(screenshotId),
            logger,
        );
        const interaction = createFakeInteraction();

        await subcommand.handle(interaction as unknown as ChatInputCommandInteraction);

        expect(interaction.calls).toHaveLength(2);
        expect(interaction.calls[0]!.method).toBe('deferReply');
        expect(interaction.calls[1]!.method).toBe('editReply');
        const { payload } = interaction.calls[1]!;
        const { content, allowedMentions } = payload as {
            content: string;
            allowedMentions: unknown;
        };

        // The literal text can still show up in content...
        expect(content).toContain('@everyone');
        // ...but discord.js must be told not to resolve it into a real mention.
        expect(allowedMentions).toEqual({ parse: [] });
    });
});
