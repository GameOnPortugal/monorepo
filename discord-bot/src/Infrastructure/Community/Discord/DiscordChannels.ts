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
 *   - MARKETPLACE: #anuncios — the intended marketplace channel (62 of 70
 *                  production ads already live there). NOT yet wired to any
 *                  behaviour: today ads post to whichever channel the
 *                  command was invoked in (5 ended up in #chat, 3 in a DM).
 *                  Routing ads here is M5.1, a separate work item — this
 *                  only makes the ID available and configurable.
 *
 * LFG channel IDs are deliberately not included here: LFG has been dropped
 * (see the decisions section of GLOBAL-PLAN.md), so configuring channels for
 * a feature that will never exist would just be dead weight.
 */
export interface DiscordIdsConfig {
    GUILD_ID: string;
    SCREENSHOTS: string;
    MARKETPLACE: string;
}

export const DISCORD_IDS_DEFAULTS: DiscordIdsConfig = {
    GUILD_ID: '818108848492773377',
    SCREENSHOTS: '827646847483904040',
    MARKETPLACE: '818447274266591243',
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
    };
}

const resolvedIds = resolveDiscordIds();

export const DiscordChannels = {
    SCREENSHOTS: resolvedIds.SCREENSHOTS,
    MARKETPLACE: resolvedIds.MARKETPLACE,
} as const;

export const DISCORD_GUILD_ID = resolvedIds.GUILD_ID;

export const convertChannel = (channel: CommunityChannels): string => {
    switch (channel) {
        case CommunityChannels.SCREENSHOTS:
            return DiscordChannels.SCREENSHOTS;
    }
};
