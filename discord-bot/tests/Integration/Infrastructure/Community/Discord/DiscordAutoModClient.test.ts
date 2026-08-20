import { describe, test, expect } from 'bun:test';
import { DiscordAutoModClient } from '../../../../../src/Infrastructure/Community/Discord/DiscordAutoModClient.ts';
import { ClientError } from '../../../../../src/Domain/Community/ClientError.ts';

/**
 * Same fail-fast contract as `DiscordGuildClient.test.ts` (M4.5/A6): a
 * `DiscordAutoModClient` built without a token must reject every public
 * method with a `ClientError` before attempting any network call, never
 * 401 deep inside discord.js with no context. These tests never call
 * `.login()` or touch a gateway — REST only, and only after an explicit
 * call — and since there is never a real token in this suite, none of them
 * can reach the real Discord API even by accident.
 */
describe('DiscordAutoModClient — no token configured', () => {
    test('listRules fails fast with a clear error, without making a request', async () => {
        const client = new DiscordAutoModClient(undefined);

        await expect(client.listRules()).rejects.toThrow(ClientError);
    });

    test('createRule fails fast with a clear error, without making a request', async () => {
        const client = new DiscordAutoModClient(undefined);

        await expect(
            client.createRule({
                key: 'k',
                displayName: 'Display',
                enabled: false,
                eventType: 'MESSAGE_SEND',
                triggerType: 'KEYWORD',
                keywordFilter: ['x'],
                regexPatterns: [],
                allowList: [],
                presets: [],
                exemptRoles: [],
                exemptChannels: [],
                actions: [{ type: 'BLOCK_MESSAGE' }],
            }),
        ).rejects.toThrow(ClientError);
    });

    test('deleteRule fails fast with a clear error, without making a request', async () => {
        const client = new DiscordAutoModClient(undefined);

        await expect(client.deleteRule('123456789012345678')).rejects.toThrow(ClientError);
    });

    test('getEveryoneChannelOverwrite fails fast with a clear error, without making a request', async () => {
        const client = new DiscordAutoModClient(undefined);

        await expect(client.getEveryoneChannelOverwrite('123456789012345678')).rejects.toThrow(
            ClientError,
        );
    });

    test('putEveryoneChannelOverwrite fails fast with a clear error, without making a request', async () => {
        const client = new DiscordAutoModClient(undefined);

        await expect(
            client.putEveryoneChannelOverwrite('123456789012345678', { allow: 0n, deny: 0n }),
        ).rejects.toThrow(ClientError);
    });

    test('the same guard fires for an empty-string token, not just undefined', async () => {
        const client = new DiscordAutoModClient('');

        await expect(client.listRules()).rejects.toThrow(ClientError);
    });
});

describe('DiscordAutoModClient — construction', () => {
    test('constructing the client does not throw and does not require a token', () => {
        expect(() => new DiscordAutoModClient(undefined)).not.toThrow();
    });
});
