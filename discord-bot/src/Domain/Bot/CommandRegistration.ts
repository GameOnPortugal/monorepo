import { createHash } from 'crypto';

/**
 * M4.3 — registration overhaul. Two framework-light pieces factored out of
 * `DiscordBot.registerSlashCommands()` specifically so they are unit
 * testable without a real Discord REST client: which route to PUT/GET, and
 * whether the locally-built command set actually differs from what Discord
 * currently has registered.
 */

/**
 * Where a boot's command set should be registered.
 *
 * `DISCORD_GUILD_ID` (see `DiscordChannels.ts`) already means something else
 * in this codebase: it is the *production* guild, defaulted to the verified
 * live Game On Portugal guild, and used to build channel links. Reusing it
 * here would mean any environment that only sets the production guild ID
 * (which is most of them, since it defaults on its own) would silently
 * register **guild-scoped** commands into **production** — shadowing the
 * global commands with a second, easily-forgotten copy in the exact guild
 * where a stray dev command set is most damaging.
 *
 * So this is a *separate*, dev-only variable (`DISCORD_DEV_GUILD_ID`,
 * plumbed through `BotEnv` in `Config/env.ts`) that defaults to unset. Unset
 * means global registration — today's behaviour, and production's — so a
 * misconfigured or incomplete `.env` fails safe (global, slow, correct)
 * rather than fails dangerous (guild-scoped into whatever guild happens to
 * be configured).
 */
export type CommandRegistrationTarget =
    | { readonly scope: 'guild'; readonly clientId: string; readonly guildId: string }
    | { readonly scope: 'global'; readonly clientId: string };

export function resolveCommandRegistrationTarget(
    clientId: string,
    devGuildId: string | undefined,
): CommandRegistrationTarget {
    const trimmed = devGuildId?.trim();
    if (trimmed) {
        return { scope: 'guild', clientId, guildId: trimmed };
    }

    return { scope: 'global', clientId };
}

/**
 * The subset of an application-command option's wire shape this codebase
 * actually sets (`addStringOption`/`addIntegerOption`/`addUserOption`/
 * `addAttachmentOption`, `addSubcommand`, `.setRequired()`, `.addChoices()`,
 * `.setMinValue()`/`.setMaxValue()`). Both the payload this process builds
 * (`SlashCommandBuilder#toJSON()`) and the payload Discord's `GET` returns
 * (`APIApplicationCommandOption`) satisfy this loosely — deliberately loose
 * (defensive reads, no strict typing) because this also has to survive
 * whatever Discord actually sends back, not just what our own builders
 * produce.
 */
interface RawCommandOption {
    type?: unknown;
    name?: unknown;
    description?: unknown;
    required?: unknown;
    autocomplete?: unknown;
    min_value?: unknown;
    max_value?: unknown;
    choices?: readonly { name?: unknown; value?: unknown }[];
    options?: readonly RawCommandOption[];
}

interface RawCommand {
    name?: unknown;
    description?: unknown;
    options?: readonly RawCommandOption[];
    default_member_permissions?: unknown;
    contexts?: readonly unknown[] | null;
    integration_types?: readonly unknown[];
}

function canonicalizeOption(option: RawCommandOption): Record<string, unknown> {
    const choices = [...(option.choices ?? [])]
        .map((choice) => ({ name: choice.name ?? null, value: choice.value ?? null }))
        .sort((a, b) => String(a.value).localeCompare(String(b.value)));

    const nestedOptions = [...(option.options ?? [])]
        .map(canonicalizeOption)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    return {
        type: option.type ?? null,
        name: option.name ?? null,
        description: option.description ?? null,
        // Discord fills these in with a default when echoing a command back
        // via GET even though we never set them explicitly — comparing
        // against the same default on both sides is what keeps this from
        // permanently mismatching.
        required: option.required ?? false,
        autocomplete: option.autocomplete ?? false,
        min_value: option.min_value ?? null,
        max_value: option.max_value ?? null,
        choices,
        options: nestedOptions,
    };
}

/**
 * Projects one command (either our own `.toJSON()` output or one entry of
 * Discord's `GET` response) down to a canonical, order-independent shape
 * containing only the fields this codebase actually manages.
 *
 * This is the fiddly part, and it's where a naive `JSON.stringify` diff
 * would go wrong in two ways:
 *  1. Discord echoes back fields we never sent (`id`, `application_id`,
 *     `version`, `guild_id`, a defaulted `nsfw`, the deprecated
 *     `dm_permission`/`default_permission`, localisation dictionaries) —
 *     excluded here entirely rather than matched, since we don't manage
 *     them and never will via this path.
 *  2. Discord does not guarantee the order of the top-level commands array
 *     or of an individual command's `options` array — every array that
 *     matters is sorted here before hashing.
 *
 * `contexts` / `integration_types` are Discord-API-documented as
 * "only for globally-scoped commands" — a guild-scoped `PUT` silently drops
 * them, so `GET`ting a guild's commands back never includes them. Comparing
 * them for a guild-scoped target would therefore *always* mismatch and
 * force a `PUT` on every single boot, defeating the point — so
 * `includeGlobalOnlyFields` (true only for `scope: 'global'`, see
 * `hashCommandSet` below) drops them from the projection instead.
 */
function canonicalizeCommand(
    command: RawCommand,
    includeGlobalOnlyFields: boolean,
): Record<string, unknown> {
    const options = [...(command.options ?? [])]
        .map(canonicalizeOption)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    return {
        name: command.name ?? null,
        description: command.description ?? null,
        default_member_permissions: command.default_member_permissions ?? null,
        contexts: includeGlobalOnlyFields ? [...(command.contexts ?? [])].sort() : null,
        integration_types: includeGlobalOnlyFields
            ? [...(command.integration_types ?? [])].sort()
            : null,
        options,
    };
}

/**
 * A stable digest of a slash-command payload array — either the locally
 * built `.toJSON()` output of every registered `SlashCommandHandler`, or
 * Discord's own `GET` response for the same scope — used to skip the `PUT`
 * when the two already agree, instead of unconditionally re-registering on
 * every boot.
 *
 * `scope` matters (see `canonicalizeCommand`'s doc comment): it decides
 * whether `contexts`/`integration_types` — meaningful only for global
 * commands — are part of the comparison at all.
 */
export function hashCommandSet(
    commands: readonly unknown[],
    scope: CommandRegistrationTarget['scope'],
): string {
    const canonical = commands
        .map((command) => canonicalizeCommand(command as RawCommand, scope === 'global'))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
