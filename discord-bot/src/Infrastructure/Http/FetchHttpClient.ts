import { type HttpClient } from '../../Domain/Http/HttpClient';
import { injectable } from 'inversify';

// Replaces the former axios-based client (M3.3). Native fetch is available
// in both Bun and Node 18+, so this drops axios and its six transitive
// packages (follow-redirects, form-data, proxy-from-env, combined-stream,
// mime-types, asynckit) along with every axios advisory.
//
// fetch validates TLS certificates by default and there is no config knob
// here that can disable that — do not add one. A previous version of this
// client set `rejectUnauthorized: false` / `checkServerIdentity: () =>
// undefined` on a custom https.Agent, which was removed as security finding
// A9. Keep it removed.
@injectable()
export default class FetchHttpClient implements HttpClient {
    async get(url: string, options?: any): Promise<any> {
        return this.request(url, { method: 'GET', ...options });
    }

    async post(url: string, body?: any): Promise<any> {
        return this.request(url, { method: 'POST', ...this.bodyInit(body) });
    }

    async put(url: string, body?: any): Promise<any> {
        return this.request(url, { method: 'PUT', ...this.bodyInit(body) });
    }

    async delete(url: string): Promise<any> {
        return this.request(url, { method: 'DELETE' });
    }

    // Mirrors axios' default request transform: strings/FormData/
    // URLSearchParams are sent as-is, plain objects are JSON-stringified
    // with an explicit Content-Type.
    private bodyInit(body: any): {
        body?: string | FormData | URLSearchParams;
        headers?: Record<string, string>;
    } {
        if (body === undefined || body === null) {
            return {};
        }

        if (
            typeof body === 'string' ||
            body instanceof FormData ||
            body instanceof URLSearchParams
        ) {
            return { body };
        }

        return {
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    // Mirrors axios' default response transform closely enough for the one
    // real caller (CreateScreenshotHandler.generateMd5FromImageUrl, which
    // hashes whatever comes back) and for future HttpClient consumers that
    // expect either a parsed JSON body or raw text back: axios's default
    // transformResponse always decodes the body to a string and only
    // returns a parsed object when that string is valid JSON, otherwise it
    // hands back the string untouched. It also throws on a non-2xx status
    // by default (`validateStatus`), which RetryHttpClient's catch blocks
    // rely on to trigger a retry — fetch does not throw on its own, so that
    // has to be done explicitly here.
    private async request(url: string, init: RequestInit): Promise<any> {
        const response = await fetch(url, init);

        if (!response.ok) {
            throw new Error(`Request to ${url} failed with status code ${response.status}`);
        }

        const text = await response.text();

        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
}
