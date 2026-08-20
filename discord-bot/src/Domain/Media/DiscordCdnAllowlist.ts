// Every URL the bot re-hosts through MediaStorage starts life as a Discord
// attachment CDN link (a screenshot or marketplace photo submitted through a
// slash command, or one recovered from message history by a relink job). The
// ingest guard in Infrastructure/Media/SafeImageFetcher.ts uses this
// allowlist to refuse to fetch anything else — an arbitrary URL should never
// be downloadable and re-hosted just because it showed up in a field that
// usually holds a Discord CDN link.
//
// M4.9 (in a parallel PR) defines the same guard for attachment ingest in
// CreateScreenshotHandler; this module intentionally duplicates rather than
// shares it to avoid a merge conflict on a file this PR does not own. Follow-
// up: unify the two once both have landed.
const ALLOWED_DISCORD_CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

export function isAllowedDiscordCdnUrl(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    return parsed.protocol === 'https:' && ALLOWED_DISCORD_CDN_HOSTS.has(parsed.hostname);
}
