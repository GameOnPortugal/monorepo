// The key scheme for objects written through MediaStorage.
//
// Rules, all deliberate:
// - Collision-free: built from identifiers that are already unique per row
//   (a ScreenshotId is a UUID; an AdId + photo index is unique per ad),
//   never from anything a re-run could regenerate differently (e.g. a
//   content hash would collide two different screenshots that happen to be
//   the same pixels, and a timestamp would not be stable across re-runs).
// - Stable: the same source maps to the same key every time a job runs
//   against it, so re-running a recovery job (M6.3) verifies/overwrites the
//   same object instead of accumulating duplicates. MediaStorage.exists()
//   is only useful for idempotency if the key a re-run computes is
//   identical to the one a previous run used — that stability is what
//   makes it so.
// - No user IDs: public URLs must never leak a Discord user ID (see
//   GLOBAL-PLAN.md's M8 privacy decision — display names only, never user
//   IDs, anywhere public). Keys are namespaced by the *content* (a
//   screenshot, an ad and its photo index), never by author, so nobody can
//   enumerate a member's uploads from their user ID either.
//
// Layout:
//   screenshots/<screenshotId>.<ext>
//   ads/<adId>/<index>.<ext>

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

export function normalizeMediaExtension(extension: string): string {
    const cleaned = extension.trim().replace(/^\./, '').toLowerCase();
    if (!EXTENSION_PATTERN.test(cleaned)) {
        throw new Error(`normalizeMediaExtension: unsafe or unexpected extension "${extension}"`);
    }
    return cleaned;
}

export function screenshotMediaKey(screenshotId: string, extension: string): string {
    if (screenshotId.length === 0) {
        throw new Error('screenshotMediaKey: screenshotId must not be empty');
    }
    return `screenshots/${screenshotId}.${normalizeMediaExtension(extension)}`;
}

export function adPhotoMediaKey(adId: string, index: number, extension: string): string {
    if (adId.length === 0) {
        throw new Error('adPhotoMediaKey: adId must not be empty');
    }
    if (!Number.isInteger(index) || index < 0) {
        throw new Error(`adPhotoMediaKey: index must be a non-negative integer, got ${index}`);
    }
    return `ads/${adId}/${index}.${normalizeMediaExtension(extension)}`;
}
