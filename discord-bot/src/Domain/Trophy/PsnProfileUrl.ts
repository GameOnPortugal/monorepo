/**
 * PSN online IDs are 3-16 characters, starting with a letter or digit, and
 * may otherwise contain only letters, digits, `-` and `_`.
 *
 * Validating here is what stops a malformed name reaching the database. One
 * profile in production (`sabathian>`, registered 2022 by the old bot's raw
 * `url.split('/')`) carries a stray `>`; PSNProfiles normalises it away on
 * fetch, so the crawl works, but it renders as `sabathian>` on every
 * leaderboard. All 118 production profiles satisfy this pattern once that
 * row is corrected, so it rejects nothing legitimate.
 */
const PSN_ONLINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,15}$/;

function toPsnOnlineId(segment: string | undefined): string | null {
    if (segment === undefined || segment.length === 0) {
        return null;
    }

    // `new URL()` percent-encodes anything unusual in the path, so a pasted
    // `.../sabathian>` arrives here as `sabathian%3E`. Decode first, then
    // validate, so the check sees the character rather than its escape.
    let decoded: string;
    try {
        decoded = decodeURIComponent(segment);
    } catch {
        return null;
    }

    return PSN_ONLINE_ID.test(decoded) ? decoded : null;
}

/**
 * Extracts a PSN profile username from either URL shape PSNProfiles.com
 * supports (M7.5):
 *
 *  - a bare profile URL: `https://psnprofiles.com/<username>`
 *  - a trophy URL: `https://psnprofiles.com/trophies/<id>-<game>/<username>`
 *
 * Ported from `old-discord-bot/src/service/trophy/psnCrawlService.js#getPsnProfileByUrl`,
 * which used a regex for the first shape and a `url.split('/')` length-6
 * check for the second (`['https:', '', 'psnprofiles.com', 'trophies',
 * '<id>-<game>', '<username>']`). Rewritten here against `URL` + the parsed
 * pathname instead of raw string splitting, and returns `null` instead of
 * throwing — every call site in this codebase wants a validation result, not
 * an exception to catch.
 *
 * Zero framework imports: pure function, Domain layer.
 */
export function extractPsnProfileFromUrl(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    // The old bot's regex was anchored to `https://`; matched here via the
    // parsed protocol rather than a prefix check so `HTTPS://` etc. can't
    // sneak past a case-sensitive string comparison.
    if (parsed.protocol !== 'https:') {
        return null;
    }

    if (parsed.hostname !== 'psnprofiles.com' && parsed.hostname !== 'www.psnprofiles.com') {
        return null;
    }

    const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);

    // Bare profile URL: https://psnprofiles.com/<username>
    if (segments.length === 1) {
        return toPsnOnlineId(segments[0]);
    }

    // Trophy URL: https://psnprofiles.com/trophies/<id>-<game>/<username>
    // — three path segments, matching the old bot's 6-part full-URL split.
    if (segments.length === 3 && segments[0] === 'trophies') {
        return toPsnOnlineId(segments[2]);
    }

    return null;
}
