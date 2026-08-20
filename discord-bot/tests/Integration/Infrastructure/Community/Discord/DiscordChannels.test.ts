import { describe, test, expect } from 'bun:test';
import {
    DISCORD_IDS_DEFAULTS,
    resolveDiscordIds,
    convertChannel,
} from '../../../../../src/Infrastructure/Community/Discord/DiscordChannels.ts';
import { CommunityChannels } from '../../../../../src/Domain/Community/CommunityChannels.ts';

/**
 * Regression coverage for M1.7 (#16): the Discord guild/channel IDs used to
 * be compile-time enum literals. They are now resolved from environment
 * variables with the verified production values as defaults, so a channel
 * move is a config redeploy rather than a code change + image rebuild.
 *
 * `resolveDiscordIds` takes `env` as a parameter specifically so this can be
 * asserted without a mocking library or mutating the real `process.env`.
 */
describe('resolveDiscordIds', () => {
    test('falls back to the verified defaults when the environment is unset', () => {
        const result = resolveDiscordIds({});

        expect(result).toEqual(DISCORD_IDS_DEFAULTS);
        expect(result).toEqual({
            GUILD_ID: '818108848492773377',
            SCREENSHOTS: '827646847483904040',
            MARKETPLACE: '818447274266591243',
            // #⚛server-log, verified against the live Discord API 2026-08-20.
            // M6.4 and M6.8 both shipped with this unset because neither had a
            // confirmed ID at the time; it has one now.
            ADMIN: '818108848492773380',
        });
    });

    test('uses the environment override when set', () => {
        const result = resolveDiscordIds({
            DISCORD_GUILD_ID: '111111111111111111',
            DISCORD_CHANNEL_SCREENSHOTS: '222222222222222222',
            DISCORD_CHANNEL_MARKETPLACE: '333333333333333333',
            DISCORD_CHANNEL_ADMIN: '555555555555555555',
        });

        expect(result).toEqual({
            GUILD_ID: '111111111111111111',
            SCREENSHOTS: '222222222222222222',
            MARKETPLACE: '333333333333333333',
            ADMIN: '555555555555555555',
        });
    });

    test('resolves each variable independently, defaulting the rest', () => {
        const result = resolveDiscordIds({ DISCORD_CHANNEL_MARKETPLACE: '444444444444444444' });

        expect(result).toEqual({
            GUILD_ID: DISCORD_IDS_DEFAULTS.GUILD_ID,
            SCREENSHOTS: DISCORD_IDS_DEFAULTS.SCREENSHOTS,
            MARKETPLACE: '444444444444444444',
            ADMIN: DISCORD_IDS_DEFAULTS.ADMIN,
        });
    });
});

/**
 * Every CommunityChannels member must resolve to a real snowflake. ADMIN has
 * a verified default now, so the empty case is only reachable by explicitly
 * setting DISCORD_CHANNEL_ADMIN='' — which must fail loudly rather than hand
 * Discord an empty channel ID that a job could post into by accident.
 */
describe('convertChannel', () => {
    test('still resolves SCREENSHOTS to its verified default', () => {
        expect(convertChannel(CommunityChannels.SCREENSHOTS)).toBe(
            DISCORD_IDS_DEFAULTS.SCREENSHOTS,
        );
    });

    test('resolves ADMIN to its verified default', () => {
        expect(convertChannel(CommunityChannels.ADMIN)).toBe(DISCORD_IDS_DEFAULTS.ADMIN);
        expect(DISCORD_IDS_DEFAULTS.ADMIN).not.toBe('');
    });
});
