import { describe, test, expect } from 'bun:test';
import { Routes } from 'discord.js';
import {
    hashCommandSet,
    resolveCommandRegistrationTarget,
} from '../../../../src/Domain/Bot/CommandRegistration';

/**
 * Unit coverage for M4.3: the two pure decisions factored out of
 * `DiscordBot.registerSlashCommands()` so they're testable without a real
 * Discord REST client — which route to PUT to (guild-scoped dev vs global
 * production), and whether the command set actually changed since the last
 * successful registration.
 */
describe('resolveCommandRegistrationTarget', () => {
    test('targets the dev guild when DISCORD_DEV_GUILD_ID is set', () => {
        const target = resolveCommandRegistrationTarget('client-1', '999999999999999999');

        expect(target).toEqual({
            scope: 'guild',
            clientId: 'client-1',
            guildId: '999999999999999999',
        });
    });

    test('targets global registration when DISCORD_DEV_GUILD_ID is unset', () => {
        const target = resolveCommandRegistrationTarget('client-1', undefined);

        expect(target).toEqual({ scope: 'global', clientId: 'client-1' });
    });

    test('targets global registration when DISCORD_DEV_GUILD_ID is blank/whitespace', () => {
        const target = resolveCommandRegistrationTarget('client-1', '   ');

        expect(target).toEqual({ scope: 'global', clientId: 'client-1' });
    });

    test('a guild-scoped target resolves to Routes.applicationGuildCommands', () => {
        const target = resolveCommandRegistrationTarget('client-1', 'guild-1');
        expect(target.scope).toBe('guild');

        const route =
            target.scope === 'guild'
                ? Routes.applicationGuildCommands(target.clientId, target.guildId)
                : Routes.applicationCommands(target.clientId);

        expect(route).toBe(Routes.applicationGuildCommands('client-1', 'guild-1'));
    });

    test('a global target resolves to Routes.applicationCommands', () => {
        const target = resolveCommandRegistrationTarget('client-1', undefined);
        expect(target.scope).toBe('global');

        const route =
            target.scope === 'guild'
                ? Routes.applicationGuildCommands(target.clientId, target.guildId)
                : Routes.applicationCommands(target.clientId);

        expect(route).toBe(Routes.applicationCommands('client-1'));
    });
});

describe('hashCommandSet', () => {
    test('is stable across two identical builds of the same command set', () => {
        const buildCommands = () => [
            { name: 'ping', description: 'Replies with a pong!', options: [] },
            {
                name: 'trophy',
                description: 'Manage trophy profiles',
                options: [{ name: 'create' }],
            },
        ];

        expect(hashCommandSet(buildCommands())).toBe(hashCommandSet(buildCommands()));
    });

    test('changes when a command in the set changes', () => {
        const before = [{ name: 'ping', description: 'Replies with a pong!', options: [] }];
        const after = [
            { name: 'ping', description: 'Replies with a pong! (updated)', options: [] },
        ];

        expect(hashCommandSet(before)).not.toBe(hashCommandSet(after));
    });

    test('changes when a command is added or removed', () => {
        const withOne = [{ name: 'ping', description: 'Replies with a pong!', options: [] }];
        const withTwo = [
            { name: 'ping', description: 'Replies with a pong!', options: [] },
            { name: 'trophy', description: 'Manage trophy profiles', options: [] },
        ];

        expect(hashCommandSet(withOne)).not.toBe(hashCommandSet(withTwo));
    });

    test('is a non-empty hex string', () => {
        const hash = hashCommandSet([{ name: 'ping' }]);

        expect(hash.length).toBeGreaterThan(0);
        expect(hash).toMatch(/^[0-9a-f]+$/);
    });
});
