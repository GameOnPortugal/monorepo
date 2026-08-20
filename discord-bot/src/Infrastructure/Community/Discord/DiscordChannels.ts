import { CommunityChannels } from '../../../Domain/Community/CommunityChannels.ts';

/**
 * Discord channel and guild snowflake IDs.
 *
 * Configurable via environment variables so a channel move is a config
 * redeploy, not a code change + image rebuild + redeploy
 * (docs/known-issues.md #16, docs/plans/GLOBAL-PLAN.md M1.7).
 *
 * The defaults below were verified against the live Discord API and the
 * production database on 2026-08-19:
 *   - GUILD_ID:    the Game On Portugal guild itself.
 *   - SCREENSHOTS: #screenshots — already wired, used by /screenshot and the
 *                  weekly winner job.
 *   - MARKETPLACE: #anuncios — the marketplace channel. `SellSubcommand` posts
 *                  every listing here via `GuildClient` (M5.1), regardless of
 *                  which channel the command was invoked from. Before M5.1,
 *                  62 of 70 production ads had already ended up here by
 *                  accident; the other 8 did not — 5 in #chat and 3 in a
 *                  **DM channel** (verified 2026-08-20: channel
 *                  1026852888636555366 is type 1). Those legacy rows keep
 *                  their own `channel_id`, which is exactly why
 *                  `GuildClient.deleteMessage` takes a raw channel id rather
 *                  than a CommunityChannels member — a DM channel id can
 *                  never be expressed as one, so routing deletes through
 *                  MARKETPLACE would silently fail to clean those up.
 *   - ADMIN:       #⚛server-log, in the 🏴Administration🏴 category. Used for
 *                  supervised dry runs of jobs before they are allowed to
 *                  post publicly (M6.4) and for per-run job summaries
 *                  (M6.8). Verified against the live Discord API on
 *                  2026-08-20, the same way the three above were — both
 *                  work items landed with this unset because neither had a
 *                  confirmed ID at the time.
 *   - TROPHIES:    where `trophies:sync` announces newly-credited trophies
 *                  (M7.8), replacing the old bot's `TROPHY_WEBHOOK`. **No
 *                  verified default** — unlike the three above, nobody has
 *                  confirmed a channel for this yet, so it defaults to the
 *                  empty string ("unconfigured") rather than a guess.
 *                  `convertChannel` throws a clear error for TROPHIES the
 *                  same way it does for a blanked-out ADMIN, and
 *                  `TrophiesSyncJob` catches that per-announcement (never
 *                  fatal) — set `DISCORD_CHANNEL_TROPHIES` before turning on
 *                  `TROPHIES_ANNOUNCE_ENABLED`.
 *
 * LFG channel IDs are deliberately not included here: LFG has been dropped
 * (see the decisions section of GLOBAL-PLAN.md), so configuring channels for
 * a feature that will never exist would just be dead weight.
 */
export interface DiscordIdsConfig {
    GUILD_ID: string;
    SCREENSHOTS: string;
    MARKETPLACE: string;
    ADMIN: string;
    TROPHIES: string;
}

export const DISCORD_IDS_DEFAULTS: DiscordIdsConfig = {
    GUILD_ID: '818108848492773377',
    SCREENSHOTS: '827646847483904040',
    MARKETPLACE: '818447274266591243',
    ADMIN: '818108848492773380',
    // No verified channel — see this file's doc comment. Empty means
    // "unconfigured", not "use some guessed default".
    TROPHIES: '',
};

/**
 * Resolves the configured Discord IDs from environment variables, falling
 * back to the verified defaults for anything unset. Takes `env` as a
 * parameter (defaulting to `process.env`) purely so it is unit-testable
 * without reaching for a mocking library.
 */
export function resolveDiscordIds(env: typeof process.env = process.env): DiscordIdsConfig {
    return {
        GUILD_ID: env.DISCORD_GUILD_ID ?? DISCORD_IDS_DEFAULTS.GUILD_ID,
        SCREENSHOTS: env.DISCORD_CHANNEL_SCREENSHOTS ?? DISCORD_IDS_DEFAULTS.SCREENSHOTS,
        MARKETPLACE: env.DISCORD_CHANNEL_MARKETPLACE ?? DISCORD_IDS_DEFAULTS.MARKETPLACE,
        ADMIN: env.DISCORD_CHANNEL_ADMIN ?? DISCORD_IDS_DEFAULTS.ADMIN,
        TROPHIES: env.DISCORD_CHANNEL_TROPHIES ?? DISCORD_IDS_DEFAULTS.TROPHIES,
    };
}

const resolvedIds = resolveDiscordIds();

export const DiscordChannels = {
    SCREENSHOTS: resolvedIds.SCREENSHOTS,
    MARKETPLACE: resolvedIds.MARKETPLACE,
    ADMIN: resolvedIds.ADMIN,
    TROPHIES: resolvedIds.TROPHIES,
} as const;

export const DISCORD_GUILD_ID = resolvedIds.GUILD_ID;

export const convertChannel = (channel: CommunityChannels): string => {
    switch (channel) {
        case CommunityChannels.SCREENSHOTS:
            return DiscordChannels.SCREENSHOTS;
        case CommunityChannels.ADMIN:
            // Defensive: ADMIN now has a verified default, so this only
            // fires if someone explicitly sets DISCORD_CHANNEL_ADMIN to an
            // empty string. Better to fail loudly than to hand Discord an
            // empty channel id.
            if (DiscordChannels.ADMIN === '') {
                throw new Error(
                    'DISCORD_CHANNEL_ADMIN is set to an empty string — unset it to use the default, or give it a real channel id.',
                );
            }
            return DiscordChannels.ADMIN;
        case CommunityChannels.MARKETPLACE:
            return DiscordChannels.MARKETPLACE;
        case CommunityChannels.TROPHIES:
            // Unlike ADMIN, empty is the *expected* out-of-the-box state
            // here — there is no verified default to fall back to. Still
            // fails loudly rather than handing Discord an empty channel id;
            // TrophiesSyncJob catches this per-announcement and logs it,
            // same as any other failed post.
            if (DiscordChannels.TROPHIES === '') {
                throw new Error(
                    'DISCORD_CHANNEL_TROPHIES is not configured — set it to the channel trophy announcements should post to before enabling TROPHIES_ANNOUNCE_ENABLED.',
                );
            }
            return DiscordChannels.TROPHIES;
    }
};
