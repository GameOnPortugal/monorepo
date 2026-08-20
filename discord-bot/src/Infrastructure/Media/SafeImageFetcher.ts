// Guards for fetching a *source* image that is about to be re-hosted (M6.2's
// fix-at-source, M6.3's screenshots:relink, M5.11's ad photos) — none of
// which are built in this PR, but all of which need this to exist first.
//
// M4.9 defines equivalent guards for attachment ingest directly in
// CreateScreenshotHandler, in a parallel PR. This module intentionally does
// not share code with it — that file is owned by that PR, and a small amount
// of duplication now is much better than a merge conflict on it. Follow-up:
// unify the two once both have landed (they should end up being the same
// four checks in one place).
//
// Four independent guards, all required because any one alone is bypassable:
// - Host allowlist: refuse anything that isn't Discord's own attachment CDN,
//   so this can never be pointed at an arbitrary URL.
// - A size cap read from the response headers before the body is touched —
//   a fast, cheap rejection for the common case of an honestly-reported
//   oversized file.
// - A streamed byte cap enforced while reading the body, because
//   Content-Length is just a header the far end sent us and cannot be
//   trusted on its own — this is the actual backstop against a lying
//   Content-Length blowing memory.
// - An explicit timeout, so a stalled connection can't hang a job forever.
import { isAllowedDiscordCdnUrl } from '../../Domain/Media/DiscordCdnAllowlist';

export interface SafeImageFetcherOptions {
    /** Hard cap enforced both against a declared Content-Length and against the actual streamed byte count. */
    maxBytes: number;
    timeoutMs: number;
}

export interface FetchedImage {
    bytes: Uint8Array;
    contentType: string;
}

export class ImageFetchRejected extends Error {}

type FetchFn = typeof fetch;

export const DEFAULT_SAFE_IMAGE_FETCHER_OPTIONS: SafeImageFetcherOptions = {
    maxBytes: 10 * 1024 * 1024, // 10 MiB — generous for a Discord attachment, small enough to bound memory
    timeoutMs: 10_000,
};

export class SafeImageFetcher {
    constructor(
        private readonly fetchFn: FetchFn = fetch,
        private readonly options: SafeImageFetcherOptions = DEFAULT_SAFE_IMAGE_FETCHER_OPTIONS,
    ) {}

    async fetch(url: string): Promise<FetchedImage> {
        if (!isAllowedDiscordCdnUrl(url)) {
            throw new ImageFetchRejected(`SafeImageFetcher: host not allowlisted for "${url}"`);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

        try {
            const response = await this.fetchFn(url, { signal: controller.signal });

            if (!response.ok) {
                throw new ImageFetchRejected(
                    `SafeImageFetcher: ${url} responded with status ${response.status}`,
                );
            }

            const declaredLength = Number(response.headers.get('content-length'));
            if (Number.isFinite(declaredLength) && declaredLength > this.options.maxBytes) {
                throw new ImageFetchRejected(
                    `SafeImageFetcher: declared Content-Length ${declaredLength} exceeds the ${this.options.maxBytes} byte cap for ${url}`,
                );
            }

            const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
            const bytes = await this.readCapped(response, url);

            return { bytes, contentType };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ImageFetchRejected(
                    `SafeImageFetcher: ${url} did not respond within ${this.options.timeoutMs}ms`,
                );
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    // The actual enforcement: read the body in chunks and bail the moment the
    // running total crosses maxBytes, regardless of what Content-Length
    // claimed.
    private async readCapped(response: Response, url: string): Promise<Uint8Array> {
        if (!response.body) {
            const buffer = new Uint8Array(await response.arrayBuffer());
            if (buffer.byteLength > this.options.maxBytes) {
                throw new ImageFetchRejected(
                    `SafeImageFetcher: body of ${buffer.byteLength} bytes exceeds the ${this.options.maxBytes} byte cap for ${url}`,
                );
            }
            return buffer;
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;

        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            total += value.byteLength;
            if (total > this.options.maxBytes) {
                await reader.cancel();
                throw new ImageFetchRejected(
                    `SafeImageFetcher: streamed body exceeded the ${this.options.maxBytes} byte cap for ${url} (Content-Length lied, or was absent)`,
                );
            }
            chunks.push(value);
        }

        const result = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }
}
