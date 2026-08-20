import { InvalidAttachment } from './InvalidAttachment.ts';

/**
 * M4.9 — attachment ingest safety.
 *
 * `CreateScreenshotHandler.generateMd5FromImageUrl()` used to fetch
 * whatever URL Discord handed it into memory with no cap, no timeout, and
 * no check on where the URL actually pointed. Split out of the handler so
 * each guard is unit-testable on its own:
 *   - `assertAllowedAttachmentHost` needs no network at all.
 *   - `downloadWithLimit` needs a real HTTP response to stream against
 *     (a local `Bun.serve()` in tests), but deliberately does not know
 *     about the host allowlist — that is a separate, cheaper check the
 *     caller runs first, so a bad host is rejected before any connection is
 *     attempted.
 */

// A "sane cap" for a screenshot attachment. Discord's own default upload
// limit is 10 MiB (25 MiB with server boosts); this sits above what a real
// screenshot needs and well below what would meaningfully threaten the
// process's memory.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 10_000;

// Discord's asset hosts. Attachment/CDN URLs come from `cdn.discordapp.com`;
// `media.discordapp.net` is included because Discord also serves resized/
// proxied attachment images from it. Nothing else is a legitimate source
// for a Discord attachment URL — A4 in docs/plans/05-bot-audit-and-hardening.md.
export const ALLOWED_ATTACHMENT_HOSTS: readonly string[] = [
    'cdn.discordapp.com',
    'media.discordapp.net',
];

/** No network — just parses the URL and checks its hostname against the allowlist. */
export function assertAllowedAttachmentHost(
    url: string,
    allowedHosts: readonly string[] = ALLOWED_ATTACHMENT_HOSTS,
): void {
    let hostname: string;
    try {
        hostname = new URL(url).hostname;
    } catch {
        throw new InvalidAttachment(`Attachment URL is not a valid URL: ${url}`);
    }

    if (!allowedHosts.includes(hostname)) {
        throw new InvalidAttachment(`Attachment host is not allowed: ${hostname}`);
    }
}

/**
 * Checks a client-reported size (e.g. Discord's `attachment.size`) before
 * any network call is made. Callers should still enforce `downloadWithLimit`
 * below regardless — a reported size cannot be trusted on its own to bound
 * memory, only to reject the obviously-too-large case early.
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

/**
 * Split out of `downloadWithLimit` so the "does the response's own
 * Content-Length already exceed the cap" check is unit-testable without a
 * real HTTP response — servers (Bun's included) tend to recompute
 * Content-Length from the actual body they send, which makes it awkward to
 * get a real response that both declares a small body and streams a large
 * one purely for a test. The mid-stream cap (enforced in
 * `downloadWithLimit` itself, independently of this) is what actually
 * protects against a lying or absent Content-Length in production.
 */
export function assertContentLengthWithinLimit(
    contentLength: string | null,
    maxBytes: number = MAX_ATTACHMENT_BYTES,
): void {
    if (contentLength !== null && Number(contentLength) > maxBytes) {
        throw new InvalidAttachment(
            `Attachment reports Content-Length ${contentLength}, over the ${maxBytes}-byte limit`,
        );
    }
}

/**
 * Downloads `url` with an explicit timeout and a hard cap enforced while
 * streaming — so a `Content-Length` that lies (or is simply absent) cannot
 * blow memory. Does not check the host; call `assertAllowedAttachmentHost`
 * first.
 */
export async function downloadWithLimit(
    url: string,
    options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<Buffer> {
    const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;
    const timeoutMs = options.timeoutMs ?? ATTACHMENT_DOWNLOAD_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let response: Response;
        try {
            response = await fetch(url, { signal: controller.signal });
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new InvalidAttachment(
                    `Attachment download timed out after ${timeoutMs}ms: ${url}`,
                );
            }
            throw error;
        }

        if (!response.ok) {
            throw new Error(`Request to ${url} failed with status code ${response.status}`);
        }

        assertContentLengthWithinLimit(response.headers.get('content-length'), maxBytes);

        if (!response.body) {
            throw new Error(`Response body is empty for ${url}`);
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                total += value.byteLength;
                if (total > maxBytes) {
                    throw new InvalidAttachment(
                        `Attachment exceeded the ${maxBytes}-byte limit while downloading`,
                    );
                }

                chunks.push(value);
            }
        } finally {
            // Best-effort: nothing further can be done if this fails, and
            // the guard above already threw the error that matters.
            await reader.cancel().catch(() => undefined);
        }

        return Buffer.concat(chunks);
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            throw new InvalidAttachment(
                `Attachment download timed out after ${timeoutMs}ms: ${url}`,
            );
        }
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}
