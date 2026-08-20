import { normalizeMediaExtension } from '../Media/MediaKey.ts';

// Helpers for resolving what MediaStorage key to use for a screenshot's
// re-hosted image (M6.2's submit-time rehost, M6.3's recovery job).
//
// The extension is read off the *source* Discord CDN URL's path rather than
// the downloaded Content-Type, and deliberately so: a Discord CDN attachment
// URL keeps the originally-uploaded filename (and its extension) in its path
// even once the URL's signature has expired and the file itself 404s — so
// this works identically whether the row is still broken (source = the dead
// `cdn.discordapp.com` URL already in the database) or already fixed
// (source = the durable `.../screenshots/<id>.<ext>` URL MediaStorage
// handed back last time, whose path *also* ends in that same extension by
// construction). That self-consistency is what lets RelinkScreenshotsJob
// compute the exact same MediaStorage key on every run for the same row,
// which is the whole idempotency mechanism — see its file doc.
const TRAILING_EXTENSION = /\.([A-Za-z0-9]{1,8})$/;

export const DEFAULT_SCREENSHOT_EXTENSION = 'png';

export function extensionFromImageUrl(
    url: string,
    fallback: string = DEFAULT_SCREENSHOT_EXTENSION,
): string {
    let pathname: string;
    try {
        pathname = new URL(url).pathname;
    } catch {
        return fallback;
    }

    const match = TRAILING_EXTENSION.exec(pathname);
    if (!match?.[1]) {
        return fallback;
    }

    try {
        return normalizeMediaExtension(match[1]);
    } catch {
        return fallback;
    }
}
