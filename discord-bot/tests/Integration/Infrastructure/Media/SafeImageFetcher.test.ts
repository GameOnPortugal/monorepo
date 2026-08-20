import { describe, test, expect } from 'bun:test';
import {
    ImageFetchRejected,
    SafeImageFetcher,
} from '../../../../src/Infrastructure/Media/SafeImageFetcher.ts';

const ALLOWED_URL = 'https://cdn.discordapp.com/attachments/1/2/image.png';

function countingFetch(handler: (url: string, init?: RequestInit) => Response): {
    fetchFn: typeof fetch;
    callCount: () => number;
} {
    let calls = 0;
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        calls += 1;
        return handler(String(input), init);
    }) as typeof fetch;
    return { fetchFn, callCount: () => calls };
}

describe('SafeImageFetcher', () => {
    test('rejects a non-allowlisted host without making any network call', async () => {
        const { fetchFn, callCount } = countingFetch(() => new Response('should not be reached'));
        const fetcher = new SafeImageFetcher(fetchFn, { maxBytes: 1024, timeoutMs: 1000 });

        await expect(fetcher.fetch('https://evil.example.com/x.png')).rejects.toThrow(
            ImageFetchRejected,
        );
        expect(callCount()).toBe(0);
    });

    test('rejects on the declared Content-Length cap check, distinctly from the streamed-cap check', async () => {
        // A ReadableStream eagerly fills its own internal queue up to its
        // high-water mark as soon as it's constructed — that's a property of
        // the stream itself, independent of whether *our* code ever calls
        // .getReader().read() on it. So what this test can actually prove is
        // narrower than "the body bytes were never touched": it proves the
        // rejection came from the cheap header check, not from the streamed
        // byte-counting loop — i.e. SafeImageFetcher didn't need to consume
        // the (declared) 2000 bytes to know to reject.
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array(2000));
                controller.close();
            },
        });
        const { fetchFn } = countingFetch(
            () =>
                new Response(stream, {
                    status: 200,
                    headers: { 'content-length': '2000', 'content-type': 'image/png' },
                }),
        );
        const fetcher = new SafeImageFetcher(fetchFn, { maxBytes: 1024, timeoutMs: 1000 });

        await expect(fetcher.fetch(ALLOWED_URL)).rejects.toThrow(/declared Content-Length/);
    });

    test('rejects a streamed body that exceeds the cap even when Content-Length lies (or is absent)', async () => {
        const maxBytes = 1024;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                // Keep pushing chunks well past the cap; no content-length header at all.
                controller.enqueue(new Uint8Array(600));
                controller.enqueue(new Uint8Array(600));
            },
        });
        const { fetchFn } = countingFetch(
            () => new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } }),
        );
        const fetcher = new SafeImageFetcher(fetchFn, { maxBytes, timeoutMs: 1000 });

        await expect(fetcher.fetch(ALLOWED_URL)).rejects.toThrow(ImageFetchRejected);
    });

    test('accepts a body within the cap and returns its bytes and content type', async () => {
        const payload = new TextEncoder().encode('a small fake image');
        const { fetchFn } = countingFetch(
            () =>
                new Response(payload, {
                    status: 200,
                    headers: {
                        'content-type': 'image/png',
                        'content-length': String(payload.byteLength),
                    },
                }),
        );
        const fetcher = new SafeImageFetcher(fetchFn, { maxBytes: 1024, timeoutMs: 1000 });

        const result = await fetcher.fetch(ALLOWED_URL);

        expect(result.contentType).toBe('image/png');
        expect(new TextDecoder().decode(result.bytes)).toBe('a small fake image');
    });

    test('rejects a non-2xx response', async () => {
        const { fetchFn } = countingFetch(() => new Response('not found', { status: 404 }));
        const fetcher = new SafeImageFetcher(fetchFn, { maxBytes: 1024, timeoutMs: 1000 });

        await expect(fetcher.fetch(ALLOWED_URL)).rejects.toThrow(ImageFetchRejected);
    });

    test('rejects when the request does not complete within the timeout', async () => {
        const fetchFn = ((_input: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    const abortError = new Error('This operation was aborted');
                    abortError.name = 'AbortError';
                    reject(abortError);
                });
            })) as typeof fetch;
        const fetcher = new SafeImageFetcher(fetchFn, { maxBytes: 1024, timeoutMs: 20 });

        await expect(fetcher.fetch(ALLOWED_URL)).rejects.toThrow(ImageFetchRejected);
    });
});
