/**
 * Raised by the M4.9 attachment ingest guards in CreateScreenshotHandler:
 * a host outside the Discord CDN allowlist, a reported/streamed size over
 * the cap, or a download that didn't finish inside the timeout.
 */
export class InvalidAttachment extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidAttachment';
    }
}
