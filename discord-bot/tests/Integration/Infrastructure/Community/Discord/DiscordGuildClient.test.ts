import { describe, test, expect } from 'bun:test';
import { DiscordGuildClient } from '../../../../../src/Infrastructure/Community/Discord/DiscordGuildClient.ts';
import { ClientError } from '../../../../../src/Domain/Community/ClientError.ts';
import { CommunityChannels } from '../../../../../src/Domain/Community/CommunityChannels.ts';
import { CustomEmoji } from '../../../../../src/Domain/Community/CustomEmoji.ts';

/**
 * Regression coverage for M4.5/A5/A6.
 *
 * A5: the previous implementation lazily built and `login()`-ed a whole
 * second gateway `Client` on the bot token. Constructing DiscordGuildClient
 * must not open any connection — these tests never call `.login()` or touch
 * a gateway at all, only REST, and only after an explicit call.
 *
 * A6: an empty/undefined token used to be passed straight through
 * (`process.env.DISCORD_TOKEN ?? ''`) and silently produced a client that
 * would fail deep inside discord.js with no context. `DiscordGuildClient`
 * now takes `token: string | undefined` and fails fast with a clear
 * `ClientError` before any network call is attempted.
 */
describe('DiscordGuildClient — no token configured', () => {
    test('sendMessage fails fast with a clear error, without making a request', async () => {
        const client = new DiscordGuildClient(undefined);

        await expect(client.sendMessage(CommunityChannels.SCREENSHOTS, 'hello')).rejects.toThrow(
            ClientError,
        );
    });

    test('getMessageUrl fails fast with a clear error, without making a request', async () => {
        const client = new DiscordGuildClient(undefined);

        await expect(
            client.getMessageUrl(CommunityChannels.SCREENSHOTS, '123456789012345678'),
        ).rejects.toThrow(ClientError);
    });

    test('getTotalReactionsByEmoji fails fast with a clear error, without making a request', async () => {
        const client = new DiscordGuildClient(undefined);

        await expect(
            client.getTotalReactionsByEmoji(
                CommunityChannels.SCREENSHOTS,
                '123456789012345678',
                CustomEmoji.TROPHY_PLAT,
            ),
        ).rejects.toThrow(ClientError);
    });

    test('deleteMessage fails fast with a clear error, without making a request', async () => {
        const client = new DiscordGuildClient(undefined);

        await expect(
            client.deleteMessage('818447274266591243', '123456789012345678'),
        ).rejects.toThrow(ClientError);
    });

    test('getMessage fails fast with a clear error, without making a request', async () => {
        const client = new DiscordGuildClient(undefined);

        await expect(
            client.getMessage(CommunityChannels.SCREENSHOTS, '123456789012345678'),
        ).rejects.toThrow(ClientError);
    });

    test('listMessages fails fast with a clear error, without making a request', async () => {
        const client = new DiscordGuildClient(undefined);

        await expect(
            client.listMessages(CommunityChannels.SCREENSHOTS, { limit: 100 }),
        ).rejects.toThrow(ClientError);
    });

    test('the same guard fires for an empty-string token, not just undefined', async () => {
        const client = new DiscordGuildClient('');

        await expect(client.sendMessage(CommunityChannels.SCREENSHOTS, 'hello')).rejects.toThrow(
            ClientError,
        );
    });
});

describe('DiscordGuildClient — construction', () => {
    test('constructing the client does not throw and does not require a token', () => {
        expect(() => new DiscordGuildClient(undefined)).not.toThrow();
    });
});
