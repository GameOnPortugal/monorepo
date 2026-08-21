import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import BrowserFetchHttpClient from '../../../../src/Infrastructure/Http/BrowserFetchHttpClient.ts';
import InMemoryLogger from '../../../Helper/InMemoryLogger.ts';
import Logger from '../../../../src/Application/Logger/Logger.ts';

/**
 * The sidecar itself needs a browser and a residential IP, so it is not
 * exercised here — these cover the contract the bot depends on: the target
 * URL survives round-tripping through the query string, a non-2xx becomes a
 * throw (RetryHttpClient's backoff keys off that, and a challenge page must
 * never reach the parser as if it were a profile), and the write verbs stay
 * refused rather than silently no-oping.
 */
describe('BrowserFetchHttpClient', () => {
    const originalFetch = globalThis.fetch;
    let requests: { url: string; init?: RequestInit }[];

    function client(): BrowserFetchHttpClient {
        return new BrowserFetchHttpClient(new Logger([new InMemoryLogger()]));
    }

    function stubFetch(response: Response) {
        globalThis.fetch = (async (url: any, init?: RequestInit) => {
            requests.push({ url: String(url), init });
            return response;
        }) as typeof fetch;
    }

    beforeEach(() => {
        requests = [];
        process.env.PSN_FETCH_URL = 'https://example.test/psn-fetch/';
        process.env.PSN_FETCH_TOKEN = 'test-token';
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        delete process.env.PSN_FETCH_URL;
        delete process.env.PSN_FETCH_TOKEN;
    });

    test('encodes the target URL and sends the bearer token', async () => {
        stubFetch(new Response('<html>ok</html>', { status: 200 }));

        const body = await client().get(
            'https://psnprofiles.com/Zephyr-pt?completion=platinum&page=1',
        );

        expect(body).toBe('<html>ok</html>');
        expect(requests).toHaveLength(1);
        // The trailing slash on PSN_FETCH_URL must not produce `//fetch`, and
        // the target's own `?`/`&` must not leak into the outer query string.
        expect(requests[0]!.url).toBe(
            'https://example.test/psn-fetch/fetch?url=' +
                encodeURIComponent('https://psnprofiles.com/Zephyr-pt?completion=platinum&page=1'),
        );
        expect((requests[0]!.init!.headers as Record<string, string>).Authorization).toBe(
            'Bearer test-token',
        );
    });

    test('throws on a non-2xx so the caller retries instead of parsing an error page', async () => {
        stubFetch(new Response('challenge did not clear', { status: 502 }));

        await expect(client().get('https://psnprofiles.com/Zephyr-pt')).rejects.toThrow(
            /failed with status code 502/,
        );
    });

    test('refuses the write verbs', async () => {
        await expect(client().post()).rejects.toThrow(/read-only/);
        await expect(client().put()).rejects.toThrow(/read-only/);
        await expect(client().delete()).rejects.toThrow(/read-only/);
    });
});
