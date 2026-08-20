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
        return segments[0] ?? null;
    }

    // Trophy URL: https://psnprofiles.com/trophies/<id>-<game>/<username>
    // — three path segments, matching the old bot's 6-part full-URL split.
    if (segments.length === 3 && segments[0] === 'trophies') {
        const username = segments[2];
        return username !== undefined && username.length > 0 ? username : null;
    }

    return null;
}
