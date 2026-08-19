import { type HttpClient } from '../../Domain/Http/HttpClient';
import { inject, injectable } from 'inversify';
import FetchHttpClient from './FetchHttpClient';
import { sleep } from '../../Application/Shared/sleep';
import { TYPES } from '../DependencyInjection/types';
import Logger from '../../Application/Logger/Logger';

// Bound to TYPES.HttpClient in inversify.config.ts but currently has no callers —
// nothing in the codebase injects TYPES.HttpClient yet. This is intentional, not
// dead code: it exists in anticipation of the PSNProfiles crawler (GLOBAL-PLAN M7.1),
// which will be the first consumer. Keep it. See docs/known-issues.md #17 / M1.8.
@injectable()
export default class RetryHttpClient implements HttpClient {
    constructor(
        @inject(FetchHttpClient) private readonly httpClient: FetchHttpClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async get(url: string, options?: any, attempt: number = 1): Promise<any> {
        try {
            return await this.httpClient.get(url, options);
        } catch (error: any) {
            const sleepMs = attempt ** 2 * 1000;
            this.logger.error(`Retrying ${attempt}, url: ${url}, sleep: ${sleepMs}`, {
                error_message: error.message,
                error,
                url,
                attempt,
                sleepMs,
            });
            if (attempt >= (options?.max_attempts ?? 5)) {
                throw error;
            }

            await sleep(sleepMs);
            return await this.get(url, options, attempt + 1);
        }
    }

    async post(url: string, body: any, attempt: number = 1): Promise<any> {
        try {
            return await this.httpClient.post(url, body);
        } catch (error: any) {
            this.logger.error('Failed to post', {
                error_message: error.message,
                error,
                url,
                attempt,
            });
            if (attempt >= 5) {
                throw error;
            }
            await sleep(attempt * 1000);
            return await this.post(url, body, attempt + 1);
        }
    }

    async put(url: string, body: string, attempt: number = 1): Promise<any> {
        try {
            return await this.httpClient.put(url, body);
        } catch (error: any) {
            this.logger.error('Failed to put', {
                error_message: error.message,
                error,
                url,
                attempt,
            });
            if (attempt >= 5) {
                throw error;
            }
            await sleep(attempt * 1000);
            return await this.put(url, body, attempt + 1);
        }
    }

    async delete(url: string, attempt: number = 1): Promise<any> {
        try {
            return await this.httpClient.delete(url);
        } catch (error: any) {
            this.logger.error('Failed to delete', {
                error_message: error.message,
                error,
                url,
                attempt,
            });
            if (attempt >= 5) {
                throw error;
            }
            await sleep(attempt * 1000);
            return await this.delete(url, attempt + 1);
        }
    }
}
