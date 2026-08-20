import { describe, test, expect } from 'bun:test';
import {
    assertAllowedAttachmentHost,
    assertContentLengthWithinLimit,
    assertReportedSizeWithinLimit,
    downloadWithLimit,
} from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/AttachmentGuard.ts';
import { InvalidAttachment } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/InvalidAttachment.ts';

/**
 * Regression coverage for M4.9 (A4):
 * `CreateScreenshotHandler.generateMd5FromImageUrl()` used to fetch
 * whatever URL it was given into memory with no size cap, no timeout, and
 * no restriction on the host. These guards close each gap independently.
 *
 * No mocking library is used in this codebase. `downloadWithLimit` needs a
 * real HTTP response to stream against, so these tests spin up a real
 * `Bun.serve()` on an ephemeral port rather than faking `fetch`.
 */
describe('assertAllowedAttachmentHost', () => {
    test('accepts the Discord CDN hosts', () => {
        expect(() =>
            assertAllowedAttachmentHost('https://cdn.discordapp.com/attachments/1/2/x.png'),
        ).not.toThrow();
        expect(() =>
            assertAllowedAttachmentHost('https://media.discordapp.net/attachments/1/2/x.png'),
        ).not.toThrow();
    });

    test('rejects a non-Discord host', () => {
        expect(() => assertAllowedAttachmentHost('https://evil.example.com/x.png')).toThrow(
            InvalidAttachment,
        );
    });

    test('rejects a host that merely contains the allowed name', () => {
        // Guards against a naive substring check: this must not pass just
        // because "cdn.discordapp.com" appears somewhere in the string.
        expect(() =>
            assertAllowedAttachmentHost('https://cdn.discordapp.com.evil.example.com/x.png'),
        ).toThrow(InvalidAttachment);
    });

    test('rejects a URL that fails to parse', () => {
        expect(() => assertAllowedAttachmentHost('not a url')).toThrow(InvalidAttachment);
    });
});

describe('assertReportedSizeWithinLimit', () => {
    test('accepts a size under the cap', () => {
        expect(() => assertReportedSizeWithinLimit(1_000, 10_000)).not.toThrow();
    });

    test('rejects an oversized reported size before any network call', () => {
        expect(() => assertReportedSizeWithinLimit(20_000, 10_000)).toThrow(InvalidAttachment);
    });
});

describe('assertContentLengthWithinLimit', () => {
    test('accepts a missing Content-Length header (nothing to check yet)', () => {
        expect(() => assertContentLengthWithinLimit(null, 100)).not.toThrow();
    });

    test('accepts a Content-Length under the cap', () => {
        expect(() => assertContentLengthWithinLimit('50', 100)).not.toThrow();
    });

    test('rejects a Content-Length over the cap', () => {
        expect(() => assertContentLengthWithinLimit('999999', 100)).toThrow(InvalidAttachment);
    });
});

describe('downloadWithLimit', () => {
    test('downloads a small body successfully', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () => new Response('hello world'),
        });

        try {
            const buffer = await downloadWithLimit(`http://127.0.0.1:${server.port}/`, {
                maxBytes: 1_000,
            });
            expect(buffer.toString('utf8')).toBe('hello world');
        } finally {
            server.stop(true);
        }
    });

    test('aborts mid-stream once the byte cap is exceeded, even when Content-Length lies', async () => {
        const maxBytes = 1_000;
        const chunk = new Uint8Array(600).fill(97); // 'a'

        const server = Bun.serve({
            port: 0,
            fetch: () => {
                const stream = new ReadableStream<Uint8Array>({
                    async start(controller) {
                        // Reports a Content-Length under the cap, then
                        // streams well past it — this is the "lying size"
                        // case the streaming cap exists for.
                        controller.enqueue(chunk);
                        controller.enqueue(chunk);
                        controller.enqueue(chunk);
                        controller.close();
                    },
                });
                return new Response(stream, {
                    headers: { 'Content-Length': String(chunk.byteLength) },
                });
            },
        });

        try {
            await expect(
                downloadWithLimit(`http://127.0.0.1:${server.port}/`, { maxBytes }),
            ).rejects.toThrow(InvalidAttachment);
        } finally {
            server.stop(true);
        }
    });

    test('times out a response that never finishes', async () => {
        const server = Bun.serve({
            port: 0,
            fetch: () => {
                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new Uint8Array([1, 2, 3]));
                        // Never closes and never sends more — simulates a
                        // stalled connection.
                    },
                });
                return new Response(stream);
            },
        });

        try {
            await expect(
                downloadWithLimit(`http://127.0.0.1:${server.port}/`, {
                    maxBytes: 1_000,
                    timeoutMs: 50,
                }),
            ).rejects.toThrow(InvalidAttachment);
        } finally {
            server.stop(true);
        }
    }, 2_000);
});
