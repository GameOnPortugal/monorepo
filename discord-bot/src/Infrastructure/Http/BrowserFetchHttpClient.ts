import { inject, injectable } from 'inversify';
import { type HttpClient } from '../../Domain/Http/HttpClient.ts';
import { TYPES } from '../DependencyInjection/types.ts';
import type Logger from '../../Application/Logger/Logger.ts';

/**
 * Fetches pages through `psn-fetch`, a browser-backed sidecar, instead of
 * fetching them directly.
 *
 * ## Why this exists
 *
 * PSNProfiles sits behind a Cloudflare managed challenge. It is not a block —
 * it is a JavaScript interstitial — so getting past it needs something that
 * actually runs the challenge. Measured against the live site (2026-08-21,
 * six pages per cell, three page types):
 *
 * | Client                                  | Hetzner (HTZ1) | Home IP |
 * | --------------------------------------- | -------------- | ------- |
 * | `fetch` / curl, any User-Agent          | 0/6            | 0/6     |
 * | curl-impersonate (real Chrome JA3)      | 0/2            | —       |
 * | FlareSolverr                            | 0/3 (timeouts) | —       |
 * | Playwright, headless                    | 0/6            | —       |
 * | Playwright, headed under xvfb           | 0/6            | 1/6     |
 * | patchright, headed under xvfb           | 0/6            | **6/6** |
 *
 * Two independent conditions have to hold at once, which is why the simpler
 * fixes all failed:
 *
 * 1. **A patched browser.** Stock Playwright leaks its automation via CDP
 *    (`Runtime.enable`); it clears the first navigation of a fresh profile
 *    and is challenged on every one after. patchright closes those leaks.
 *    Note the fingerprint theories that did *not* hold: TLS/JA3 alone did
 *    nothing, and the passing runs were software-rendered (SwiftShader),
 *    so it is not a WebGL/GPU check.
 * 2. **A non-datacenter IP.** Hetzner's ASN fails 0/12 regardless of client.
 *    This is why the sidecar has to live off HTZ1 rather than beside the bot.
 *
 * ## Consequences for the caller
 *
 * `TYPES.HttpClient` still resolves to `RetryHttpClient` for everything else;
 * only `PsnProfilesTrophySource` is given this one. Requests are serialised
 * and throttled inside the sidecar, next to the browser that owns the
 * Cloudflare clearance cookie, rather than here — a second bot process would
 * otherwise silently double the request rate against a site with no API.
 */
@injectable()
export default class BrowserFetchHttpClient implements HttpClient {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly timeoutMs: number;

    constructor(@inject(TYPES.Logger) private readonly logger: Logger) {
        this.baseUrl = (process.env.PSN_FETCH_URL ?? '').replace(/\/+$/, '');
        this.token = process.env.PSN_FETCH_TOKEN ?? '';
        this.timeoutMs = Number(process.env.PSN_FETCH_TIMEOUT_MS ?? 120_000);
    }

    async get(url: string, _options?: any): Promise<any> {
        const endpoint = `${this.baseUrl}/fetch?url=${encodeURIComponent(url)}`;

        // The sidecar drives a real browser through a Cloudflare challenge,
        // so a single request can legitimately take tens of seconds. Without
        // an explicit signal this would sit on the runtime's default timeout
        // and stall the whole sync walk.
        const response = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${this.token}` },
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            // Thrown, not returned: RetryHttpClient's backoff keys off a
            // throw, and a challenge page that slipped through would
            // otherwise be handed to the parser as if it were a profile.
            throw new Error(
                `psn-fetch request for ${url} failed with status code ${response.status}` +
                    (detail ? `: ${detail.slice(0, 200)}` : ''),
            );
        }

        return response.text();
    }

    // The trophy source only ever reads. Leaving these as explicit throws
    // keeps the HttpClient contract honest instead of quietly no-oping a
    // write someone adds later.
    async post(): Promise<never> {
        throw new Error('BrowserFetchHttpClient is read-only: post() is not supported');
    }

    async put(): Promise<never> {
        throw new Error('BrowserFetchHttpClient is read-only: put() is not supported');
    }

    async delete(): Promise<never> {
        throw new Error('BrowserFetchHttpClient is read-only: delete() is not supported');
    }
}
