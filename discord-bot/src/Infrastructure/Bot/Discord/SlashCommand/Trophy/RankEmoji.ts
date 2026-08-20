import { DiscordEmoji } from '../../../../Community/Discord/DiscordEmoji.ts';

/**
 * Position -> guild custom emoji, ported from the old bot's `emojiEnum.js` +
 * `commands/trophy/trophy.js` (`docs/discord-bot-feature-gap.md` §4.7): 1st
 * gets platinum, 2nd gold, 3rd silver, everyone else bronze.
 */
export interface RankEmojiIds {
    readonly plat: string;
    readonly gold: string;
    readonly silver: string;
    readonly bronze: string;
}

export const DEFAULT_RANK_EMOJI_IDS: RankEmojiIds = {
    plat: DiscordEmoji.TROPHY_PLAT,
    gold: DiscordEmoji.TROPHY_GOLD,
    silver: DiscordEmoji.TROPHY_SILVER,
    bronze: DiscordEmoji.TROPHY_BRONZE,
};

const EMOJI_NAMES: Record<keyof RankEmojiIds, string> = {
    plat: 'trophy_plat',
    gold: 'trophy_gold',
    silver: 'trophy_silver',
    bronze: 'trophy_bronze',
};

/** Unicode medal to fall back to when the matching guild emoji id is unset. */
const UNICODE_FALLBACK: Record<keyof RankEmojiIds, string> = {
    plat: '🥇',
    gold: '🥈',
    silver: '🥉',
    bronze: '🏅',
};

/**
 * Renders the emoji for a 1-indexed leaderboard position.
 *
 * `DiscordEmoji`'s ids are hardcoded constants today and are never actually
 * empty, but `emojiIds` is still a parameter (rather than reading the enum
 * directly) so this degrades correctly if that ever changes — an unset id
 * falls back to a unicode medal instead of formatting `<:name:>`/`<:name:0>`,
 * which Discord does not render as an icon, only as that literal broken text.
 */
export function formatRankPositionEmoji(
    position: number,
    emojiIds: RankEmojiIds = DEFAULT_RANK_EMOJI_IDS,
): string {
    const key = positionKey(position);
    const id = emojiIds[key];

    if (!id) {
        return UNICODE_FALLBACK[key];
    }

    return `<:${EMOJI_NAMES[key]}:${id}>`;
}

function positionKey(position: number): keyof RankEmojiIds {
    switch (position) {
        case 1:
            return 'plat';
        case 2:
            return 'gold';
        case 3:
            return 'silver';
        default:
            return 'bronze';
    }
}
