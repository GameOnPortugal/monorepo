import { describe, test, expect } from 'bun:test';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    Routes,
    SlashCommandBuilder,
} from 'discord.js';
import {
    hashCommandSet,
    resolveCommandRegistrationTarget,
} from '../../../../src/Domain/Bot/CommandRegistration';

/**
 * Unit coverage for M4.3: the two pure decisions factored out of
 * `DiscordBot.registerSlashCommands()` so they're testable without a real
 * Discord REST client — which route to PUT/GET (guild-scoped dev vs global
 * production), and whether the locally-built command set actually differs
 * from what Discord's `GET` reports it already has registered.
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

/**
 * A realistic locally-built command, shaped like `TrophySlashCommand`'s
 * `rank` subcommand: a top-level command with one subcommand carrying a
 * required string option with choices and an optional integer option with
 * min/max bounds — enough surface to exercise every canonicalized field.
 */
function buildLocalCommand() {
    return new SlashCommandBuilder()
        .setName('trophy')
        .setDescription('Manage trophy profiles')
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
        .setDefaultMemberPermissions(null)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('rank')
                .setDescription('View trophy rankings')
                .addStringOption((option) =>
                    option
                        .setName('type')
                        .setDescription('Type of ranking')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Monthly', value: 'monthly' },
                            { name: 'Lifetime', value: 'lifetime' },
                        ),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('limit')
                        .setDescription('Number of results')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                ),
        )
        .toJSON();
}

/**
 * The same logical command as `buildLocalCommand()`, but shaped the way
 * Discord's `GET /applications/{id}/commands` actually echoes it back:
 * extra server-assigned fields this codebase never sent (`id`,
 * `application_id`, `version`, `nsfw`, `dm_permission`), options and choices
 * reordered, and `required`/`autocomplete` spelled out explicitly where the
 * local builder left them implicit.
 */
function buildRemoteEquivalent() {
    return {
        id: '1111111111111111111',
        application_id: '2222222222222222222',
        version: '3333333333333333333',
        type: 1,
        name: 'trophy',
        description: 'Manage trophy profiles',
        default_member_permissions: null,
        dm_permission: false,
        nsfw: false,
        contexts: [InteractionContextType.Guild],
        integration_types: [ApplicationIntegrationType.GuildInstall],
        options: [
            {
                type: 1, // SUB_COMMAND
                name: 'rank',
                description: 'View trophy rankings',
                options: [
                    // Reordered relative to the local build (limit before type).
                    {
                        type: 4, // INTEGER
                        name: 'limit',
                        description: 'Number of results',
                        required: false,
                        autocomplete: false,
                        min_value: 1,
                        max_value: 10,
                    },
                    {
                        type: 3, // STRING
                        name: 'type',
                        description: 'Type of ranking',
                        required: true,
                        autocomplete: false,
                        // Choices reordered too.
                        choices: [
                            { name: 'Lifetime', value: 'lifetime' },
                            { name: 'Monthly', value: 'monthly' },
                        ],
                    },
                ],
            },
        ],
    };
}

describe('hashCommandSet', () => {
    test('is stable across two identical builds of the same command set', () => {
        const buildCommands = () => [buildLocalCommand()];

        expect(hashCommandSet(buildCommands(), 'global')).toBe(
            hashCommandSet(buildCommands(), 'global'),
        );
    });

    test('changes when a command in the set changes', () => {
        const before = [buildLocalCommand()];
        const after = [
            new SlashCommandBuilder()
                .setName('trophy')
                .setDescription('Manage trophy profiles (updated)')
                .setContexts(InteractionContextType.Guild)
                .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
                .setDefaultMemberPermissions(null)
                .toJSON(),
        ];

        expect(hashCommandSet(before, 'global')).not.toBe(hashCommandSet(after, 'global'));
    });

    test('changes when a command is added or removed', () => {
        const ping = new SlashCommandBuilder().setName('ping').setDescription('pong').toJSON();
        const withOne = [ping];
        const withTwo = [ping, buildLocalCommand()];

        expect(hashCommandSet(withOne, 'global')).not.toBe(hashCommandSet(withTwo, 'global'));
    });

    test('is a non-empty hex string', () => {
        const hash = hashCommandSet([buildLocalCommand()], 'global');

        expect(hash.length).toBeGreaterThan(0);
        expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    test('is independent of the order of the top-level commands array', () => {
        const ping = new SlashCommandBuilder().setName('ping').setDescription('pong').toJSON();
        const trophy = buildLocalCommand();

        expect(hashCommandSet([ping, trophy], 'global')).toBe(
            hashCommandSet([trophy, ping], 'global'),
        );
    });

    test('matches Discord GET-shaped input for the same logical command — reordered options/choices, extra server fields, and explicit defaults included', () => {
        const local = [buildLocalCommand()];
        const remote = [buildRemoteEquivalent()];

        expect(hashCommandSet(local, 'global')).toBe(hashCommandSet(remote, 'global'));
    });

    test('guild scope ignores contexts/integration_types (Discord drops them for guild-scoped commands)', () => {
        const local = [buildLocalCommand()];
        // A real guild-scoped GET response never includes these fields at
        // all — Discord's API docs mark them "only for globally-scoped
        // commands" — so this simulates that by omitting them entirely.
        const remote = [buildRemoteEquivalent()];
        const { contexts, integration_types, ...remoteWithoutGlobalFields } = remote[0]!;
        void contexts;
        void integration_types;

        expect(hashCommandSet(local, 'guild')).toBe(
            hashCommandSet([remoteWithoutGlobalFields], 'guild'),
        );
    });

    test('global scope requires contexts to actually match', () => {
        const local = [buildLocalCommand()];
        const remote = buildRemoteEquivalent();
        const driftedRemote = [{ ...remote, contexts: [InteractionContextType.PrivateChannel] }];

        expect(hashCommandSet(local, 'global')).not.toBe(hashCommandSet(driftedRemote, 'global'));
    });
});
