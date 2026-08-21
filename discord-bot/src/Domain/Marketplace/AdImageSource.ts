import { normalizeMediaExtension } from '../Media/MediaKey.ts';

// Resolves what MediaStorage key extension to use for an ad photo re-hosted
// at submit time (M5.11), reading it off the *source* Discord CDN URL's
// path — same approach, and the same reasoning, as
// `Domain/Screenshot/ScreenshotImageSource.ts`'s `extensionFromImageUrl`
// (M6.2/M6.3): a Discord attachment URL keeps its original filename's
// extension in the path even once the URL's signature has expired.
//
// Deliberately a separate, near-identical file rather than an import from
// `Domain/Screenshot` — cross-aggregate imports for a few lines of pure
// string parsing aren't worth coupling the marketplace and screenshots areas
// together, and `AttachmentGuard.ts`'s doc comment already sets the
// precedent in this codebase for small, independent duplication over a
// cross-area dependency for something this small.
const TRAILING_EXTENSION = /\.([A-Za-z0-9]{1,8})$/;

export const DEFAULT_AD_IMAGE_EXTENSION = 'png';

export function extensionFromAdImageUrl(
    url: string,
    fallback: string = DEFAULT_AD_IMAGE_EXTENSION,
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
