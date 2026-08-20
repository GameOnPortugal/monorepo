import { InvalidAttachment } from './InvalidAttachment.ts';

/**
 * M4.9 — attachment ingest safety, cheap pre-checks only.
 *
 * The host allowlist and the actual capped/streamed/timed-out download used
 * to live in this file too (`assertAllowedAttachmentHost`,
 * `assertContentLengthWithinLimit`, `downloadWithLimit`), duplicating
 * `Infrastructure/Media/SafeImageFetcher.ts` on purpose — that module and
 * this one landed in parallel PRs (M4.9 and M6.0) and a merge conflict on
 * either wasn't worth avoiding a few dozen duplicated lines. Both have now
 * landed (M6.2), and `CreateScreenshotHandler` re-hosts through
 * `MediaStorage`, so it needs `SafeImageFetcher` anyway — this is the
 * "unify the two" follow-up both files' doc comments promised. Only
 * `assertReportedSizeWithinLimit` survives here: it is a same-signature,
 * zero-network short-circuit against Discord's own `attachment.size` that
 * `SafeImageFetcher.fetch()` has no equivalent for (it only sees a
 * Content-Length header once the request is already in flight).
 */

// A "sane cap" for a screenshot attachment. Discord's own default upload
// limit is 10 MiB (25 MiB with server boosts); this sits above what a real
// screenshot needs and well below what would meaningfully threaten the
// process's memory. Matches SafeImageFetcher's own default cap.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Checks a client-reported size (e.g. Discord's `attachment.size`) before
 * any network call is made. Callers should still enforce a real cap on the
 * download itself regardless — a reported size cannot be trusted on its own
 * to bound memory, only to reject the obviously-too-large case early.
 */
export function assertReportedSizeWithinLimit(
    size: number,
    maxBytes: number = MAX_ATTACHMENT_BYTES,
): void {
    if (size > maxBytes) {
        throw new InvalidAttachment(
            `Attachment reports ${size} bytes, over the ${maxBytes}-byte limit`,
        );
    }
}
