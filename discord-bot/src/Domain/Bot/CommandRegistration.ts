import { createHash } from 'crypto';

/**
 * M4.3 — registration overhaul. Two framework-light pieces factored out of
 * `DiscordBot.registerSlashCommands()` specifically so they are unit
 * testable without a real Discord REST client: which route to PUT to, and
 * whether the command set actually changed since the last successful PUT.
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
 * A stable digest of a slash-command payload array (the `.toJSON()` output
 * of every registered `SlashCommandHandler.builder()`), used to skip the
 * `PUT` to Discord when the set hasn't changed since the last successful
 * registration — every boot re-registers unconditionally today.
 *
 * `JSON.stringify` is only a safe basis for a stable hash here because
 * `SlashCommandBuilder#toJSON()` always emits the same key order for a given
 * builder chain (it builds a plain object literal in fixed field order, not
 * from a `Map` or object spread of varying inputs) and the handler list this
 * is called with (`BotExecutor.slashCommandHandlers`) is registered in a
 * fixed order in `inversify.config.ts`. This is not a general-purpose
 * "hash any object" helper — don't reuse it for input whose key/array order
 * can legitimately vary between equivalent values.
 */
export function hashCommandSet(commands: readonly unknown[]): string {
    return createHash('sha256').update(JSON.stringify(commands)).digest('hex');
}
