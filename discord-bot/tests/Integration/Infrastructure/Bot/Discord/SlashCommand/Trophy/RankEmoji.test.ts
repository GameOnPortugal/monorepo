import { describe, expect, it } from 'bun:test';
import {
    DEFAULT_RANK_EMOJI_IDS,
    formatRankPositionEmoji,
} from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Trophy/RankEmoji';

describe('formatRankPositionEmoji (M7.6)', () => {
    it('renders the guild custom emoji for positions 1, 2 and 3', () => {
        expect(formatRankPositionEmoji(1)).toBe(`<:trophy_plat:${DEFAULT_RANK_EMOJI_IDS.plat}>`);
        expect(formatRankPositionEmoji(2)).toBe(`<:trophy_gold:${DEFAULT_RANK_EMOJI_IDS.gold}>`);
        expect(formatRankPositionEmoji(3)).toBe(
            `<:trophy_silver:${DEFAULT_RANK_EMOJI_IDS.silver}>`,
        );
    });

    it('renders the bronze emoji for every position after the podium', () => {
        expect(formatRankPositionEmoji(4)).toBe(
            `<:trophy_bronze:${DEFAULT_RANK_EMOJI_IDS.bronze}>`,
        );
        expect(formatRankPositionEmoji(50)).toBe(
            `<:trophy_bronze:${DEFAULT_RANK_EMOJI_IDS.bronze}>`,
        );
    });

    it('degrades to a unicode medal instead of a broken mention when an emoji id is unset', () => {
        const withoutPlat = { ...DEFAULT_RANK_EMOJI_IDS, plat: '' };

        const rendered = formatRankPositionEmoji(1, withoutPlat);

        expect(rendered).toBe('🥇');
        expect(rendered).not.toContain('<:');
    });

    it('degrades every position independently, not just position 1', () => {
        const noneConfigured = { plat: '', gold: '', silver: '', bronze: '' };

        expect(formatRankPositionEmoji(1, noneConfigured)).toBe('🥇');
        expect(formatRankPositionEmoji(2, noneConfigured)).toBe('🥈');
        expect(formatRankPositionEmoji(3, noneConfigured)).toBe('🥉');
        expect(formatRankPositionEmoji(4, noneConfigured)).toBe('🏅');
    });
});
