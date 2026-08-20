import { describe, test, expect } from 'bun:test';
import { assertReportedSizeWithinLimit } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/AttachmentGuard.ts';
import { InvalidAttachment } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/InvalidAttachment.ts';

/**
 * Regression coverage for M4.9 (A4)'s reported-size short-circuit. The host
 * allowlist, Content-Length check and capped/streamed/timed-out download
 * that used to live alongside this in AttachmentGuard.ts were removed in
 * M6.2 — CreateScreenshotHandler now downloads through
 * `Infrastructure/Media/SafeImageFetcher.ts` (M6.0) instead, which already
 * has equivalent coverage in its own test file. See AttachmentGuard.ts's
 * doc comment for why.
 */
describe('assertReportedSizeWithinLimit', () => {
    test('accepts a size under the cap', () => {
        expect(() => assertReportedSizeWithinLimit(1_000, 10_000)).not.toThrow();
    });

    test('rejects an oversized reported size before any network call', () => {
        expect(() => assertReportedSizeWithinLimit(20_000, 10_000)).toThrow(InvalidAttachment);
    });
});
