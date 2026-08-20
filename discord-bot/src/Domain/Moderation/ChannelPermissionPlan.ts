import type { ChannelPermissionOverwrite } from '../Community/AutoModClient.ts';

/**
 * Discord permission bit positions (bitwise permission flags), see
 * https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags.
 * Hardcoded as `BigInt` literals rather than importing discord.js's
 * `PermissionFlagsBits` — Domain/ has zero framework imports (CLAUDE.md),
 * and these two bit positions are Discord API constants, not a discord.js
 * construct, so hand-copying them costs nothing and keeps the boundary
 * clean. `Infrastructure/Community/Discord/DiscordAutoModClient.ts` is
 * free to cross-check these against `PermissionFlagsBits` in its own tests
 * if the mapping is ever in doubt.
 */
export const PERMISSION_BIT_SEND_MESSAGES = 1n << 11n; // 2048n
export const PERMISSION_BIT_USE_APPLICATION_COMMANDS = 1n << 31n; // 2147483648n

interface ManagedBit {
    bit: bigint;
    /** true = force into `allow`, false = force into `deny`. Never "leave alone" — that's not a managed bit at all. */
    grant: boolean;
}

/**
 * The two bits M9.1's "commands only" channels manage on the `@everyone`
 * overwrite: no ordinary messages, slash commands still work. Every other
 * bit on the existing overwrite — including ones a moderator set by hand for
 * an unrelated reason — passes through untouched, because `mergeManagedBits`
 * only ever clears and re-sets the bits named here.
 */
export const COMMANDS_ONLY_MANAGED_BITS: ManagedBit[] = [
    { bit: PERMISSION_BIT_SEND_MESSAGES, grant: false },
    { bit: PERMISSION_BIT_USE_APPLICATION_COMMANDS, grant: true },
];

/**
 * Applies a fixed set of "this bit must be allowed / denied" rules on top of
 * whatever `current` already holds, leaving every other bit exactly as it
 * was. Discord's permission-overwrite PUT replaces the whole allow/deny pair
 * — there is no partial-update endpoint — so this merge has to happen
 * client-side before every `putEveryoneChannelOverwrite` call, or an
 * unrelated hand-set bit (e.g. a moderator granting `ManageMessages` to
 * `@everyone` for some reason) would be silently wiped the first time
 * `automod:apply` touches that channel.
 */
export function mergeManagedBits(
    current: ChannelPermissionOverwrite,
    managedBits: ManagedBit[],
): ChannelPermissionOverwrite {
    let { allow, deny } = current;

    for (const { bit, grant } of managedBits) {
        allow &= ~bit;
        deny &= ~bit;
        if (grant) {
            allow |= bit;
        } else {
            deny |= bit;
        }
    }

    return { allow, deny };
}

export interface ChannelPermissionPlanEntry {
    channelId: string;
    current: ChannelPermissionOverwrite;
    desired: ChannelPermissionOverwrite;
    changed: boolean;
}

/**
 * `current === null` means the channel has no `@everyone` overwrite at all
 * yet (Discord's default: `allow: 0n, deny: 0n`, i.e. "inherit category
 * permissions") — treated the same as an all-zero overwrite for merge
 * purposes, since PUTting a brand new overwrite and merging into an
 * all-zero implicit one produce the same desired bits.
 */
export function buildCommandsOnlyChannelPlan(
    channelId: string,
    current: ChannelPermissionOverwrite | null,
): ChannelPermissionPlanEntry {
    const base = current ?? { allow: 0n, deny: 0n };
    const desired = mergeManagedBits(base, COMMANDS_ONLY_MANAGED_BITS);

    return {
        channelId,
        current: base,
        desired,
        changed: desired.allow !== base.allow || desired.deny !== base.deny,
    };
}
