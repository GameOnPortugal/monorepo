import { describe, test, expect } from 'bun:test';
import { S3MediaStorage } from '../../../../src/Infrastructure/Media/S3MediaStorage.ts';

interface RecordedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

// A hand-rolled fake standing in for MinIO's HTTP surface — no mocking
// library, no real network request. Each test wires up exactly the
// responses it needs.
function fakeFetch(handler: (req: RecordedRequest) => Response): {
    fetchFn: typeof fetch;
    calls: RecordedRequest[];
} {
    const calls: RecordedRequest[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => {
            headers[key] = value;
        });
        const recorded: RecordedRequest = {
            url: String(input),
            method: init?.method ?? 'GET',
            headers,
            body: init?.body,
        };
        calls.push(recorded);
        return handler(recorded);
    }) as typeof fetch;
    return { fetchFn, calls };
}

function storage(fetchFn: typeof fetch): S3MediaStorage {
    return new S3MediaStorage(
        {
            endpoint: 'http://minio:9000',
            publicUrl: 'https://media.game-on-portugal.pt',
            bucket: 'gop-media',
            accessKeyId: 'gameonportugal',
            secretAccessKey: 'super-secret-key',
        },
        fetchFn,
    );
}

describe('S3MediaStorage', () => {
    describe('put', () => {
        test('PUTs to the path-style bucket/key URL and returns the durable public URL', async () => {
            const { fetchFn, calls } = fakeFetch(() => new Response(null, { status: 200 }));
            const s3 = storage(fetchFn);

            const url = await s3.put({
                key: 'screenshots/abc.png',
                body: new TextEncoder().encode('fake-png-bytes'),
                contentType: 'image/png',
            });

            expect(url).toBe('https://media.game-on-portugal.pt/gop-media/screenshots/abc.png');
            expect(calls).toHaveLength(1);
            expect(calls[0]!.method).toBe('PUT');
            expect(calls[0]!.url).toBe('http://minio:9000/gop-media/screenshots/abc.png');
            expect(calls[0]!.headers['content-type']).toBe('image/png');
            expect(calls[0]!.headers['authorization']).toContain('AWS4-HMAC-SHA256');
            expect(calls[0]!.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
        });

        test('percent-encodes each key segment without touching the slashes', async () => {
            const { fetchFn, calls } = fakeFetch(() => new Response(null, { status: 200 }));
            const s3 = storage(fetchFn);

            await s3.put({
                key: 'ads/ad id with spaces/0.png',
                body: new Uint8Array(),
                contentType: 'image/png',
            });

            expect(calls[0]!.url).toBe(
                'http://minio:9000/gop-media/ads/ad%20id%20with%20spaces/0.png',
            );
        });

        test('throws on a non-2xx response', async () => {
            const { fetchFn } = fakeFetch(() => new Response('nope', { status: 500 }));
            const s3 = storage(fetchFn);

            await expect(
                s3.put({ key: 'x.png', body: new Uint8Array(), contentType: 'image/png' }),
            ).rejects.toThrow(/500/);
        });
    });

    describe('exists', () => {
        test('returns true on a 200 HEAD', async () => {
            const { fetchFn, calls } = fakeFetch(() => new Response(null, { status: 200 }));
            const s3 = storage(fetchFn);

            expect(await s3.exists('screenshots/abc.png')).toBe(true);
            expect(calls[0]!.method).toBe('HEAD');
        });

        test('returns false on a 404 HEAD rather than throwing — this is what makes a re-host job idempotent', async () => {
            const { fetchFn } = fakeFetch(() => new Response(null, { status: 404 }));
            const s3 = storage(fetchFn);

            expect(await s3.exists('screenshots/missing.png')).toBe(false);
        });

        test('throws on an unexpected non-2xx, non-404 status', async () => {
            const { fetchFn } = fakeFetch(() => new Response(null, { status: 503 }));
            const s3 = storage(fetchFn);

            await expect(s3.exists('screenshots/abc.png')).rejects.toThrow(/503/);
        });
    });

    describe('delete', () => {
        test('resolves on a 204', async () => {
            const { fetchFn } = fakeFetch(() => new Response(null, { status: 204 }));
            const s3 = storage(fetchFn);

            await expect(s3.delete('screenshots/abc.png')).resolves.toBeUndefined();
        });

        test('resolves on a 404 too — delete is idempotent', async () => {
            const { fetchFn } = fakeFetch(() => new Response(null, { status: 404 }));
            const s3 = storage(fetchFn);

            await expect(s3.delete('screenshots/already-gone.png')).resolves.toBeUndefined();
        });

        test('throws on a real failure', async () => {
            const { fetchFn } = fakeFetch(() => new Response(null, { status: 500 }));
            const s3 = storage(fetchFn);

            await expect(s3.delete('screenshots/abc.png')).rejects.toThrow(/500/);
        });
    });

    describe('idempotency loop (exists -> skip put)', () => {
        test('a caller checking exists() before put() never re-uploads an object already there', async () => {
            const written = new Set<string>();
            const { fetchFn } = fakeFetch((req) => {
                if (req.method === 'HEAD') {
                    return new Response(null, { status: written.has(req.url) ? 200 : 404 });
                }
                written.add(req.url);
                return new Response(null, { status: 200 });
            });
            const s3 = storage(fetchFn);
            const key = 'screenshots/rerun.png';

            // First run: not there yet, so put() actually uploads.
            expect(await s3.exists(key)).toBe(false);
            await s3.put({ key, body: new Uint8Array([1, 2, 3]), contentType: 'image/png' });

            // Second run over the same key: exists() now short-circuits it.
            expect(await s3.exists(key)).toBe(true);
        });
    });
});
