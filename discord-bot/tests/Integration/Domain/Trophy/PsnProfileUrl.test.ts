import { describe, test, expect } from 'bun:test';
import { extractPsnProfileFromUrl } from '../../../../src/Domain/Trophy/PsnProfileUrl';

/**
 * M7.5 — `/trophy create` must accept both URL shapes PSNProfiles supports:
 * a bare profile URL and a 6-segment trophy URL. Table-driven over both
 * shapes plus realistic malformed input, matching
 * `old-discord-bot/src/service/trophy/psnCrawlService.js#getPsnProfileByUrl`'s
 * behaviour (see PsnProfileUrl.ts's doc comment for the port notes).
 */
describe('extractPsnProfileFromUrl', () => {
    const cases: Array<{ description: string; url: string; expected: string | null }> = [
        // -- accepted shapes -------------------------------------------------
        {
            description: 'bare profile URL',
            url: 'https://psnprofiles.com/Josh_Lopes',
            expected: 'Josh_Lopes',
        },
        {
            description: 'bare profile URL with www.',
            url: 'https://www.psnprofiles.com/Josh_Lopes',
            expected: 'Josh_Lopes',
        },
        {
            description: '6-segment trophy URL',
            url: 'https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes',
            expected: 'Josh_Lopes',
        },
        {
            description: '6-segment trophy URL with www.',
            url: 'https://www.psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes',
            expected: 'Josh_Lopes',
        },
        {
            description: 'profile username containing digits/underscores',
            url: 'https://psnprofiles.com/Josh_Lopes_92',
            expected: 'Josh_Lopes_92',
        },

        // -- malformed / rejected input --------------------------------------
        { description: 'not a URL at all', url: 'not-a-url', expected: null },
        { description: 'empty string', url: '', expected: null },
        {
            description: 'http (not https) is rejected',
            url: 'http://psnprofiles.com/Josh_Lopes',
            expected: null,
        },
        {
            description: 'wrong host entirely',
            url: 'https://example.com/Josh_Lopes',
            expected: null,
        },
        {
            description: 'lookalike host (psnprofiles.com.evil.example)',
            url: 'https://psnprofiles.com.evil.example/Josh_Lopes',
            expected: null,
        },
        {
            description: 'bare domain, no username',
            url: 'https://psnprofiles.com/',
            expected: null,
        },
        {
            description: 'bare domain, no path at all',
            url: 'https://psnprofiles.com',
            expected: null,
        },
        {
            description: 'trophy URL missing the username segment',
            url: 'https://psnprofiles.com/trophies/11783-assassins-creed-valhalla',
            expected: null,
        },
        {
            description: 'trophy URL with a trailing slash (empty username segment)',
            url: 'https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/',
            expected: null,
        },
        {
            description: 'too many path segments',
            url: 'https://psnprofiles.com/trophies/11783-game/extra/Josh_Lopes',
            expected: null,
        },
        {
            description: 'three segments but not starting with "trophies"',
            url: 'https://psnprofiles.com/games/some-game/Josh_Lopes',
            expected: null,
        },
    ];

    for (const { description, url, expected } of cases) {
        test(`${description} (${JSON.stringify(url)}) -> ${JSON.stringify(expected)}`, () => {
            expect(extractPsnProfileFromUrl(url)).toBe(expected);
        });
    }
});
