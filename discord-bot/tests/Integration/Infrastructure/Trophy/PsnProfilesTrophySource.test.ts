import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PsnProfilesTrophySource } from '../../../../src/Infrastructure/Trophy/PsnProfilesTrophySource';
import { TrophyNotEarnedYet } from '../../../../src/Domain/Trophy/TrophyNotEarnedYet';
import type { HttpClient } from '../../../../src/Domain/Http/HttpClient';

/**
 * PsnProfilesTrophySource is ported from
 * old-discord-bot/src/service/trophy/psnCrawlService.js, which scraped
 * PSNProfiles with JSDOM + jQuery. This suite exercises the regex-based
 * parser against small, trimmed HTML fixtures (tests/.../fixtures/*.html)
 * standing in for real PSNProfiles markup — no mocking library, no network
 * calls. A FakeHttpClient below returns canned fixture content keyed by URL.
 */

function fixture(name: string): string {
    return readFileSync(join(import.meta.dir, 'fixtures', name), 'utf-8');
}

class FakeHttpClient implements HttpClient {
    public readonly requestedUrls: string[] = [];

    constructor(private readonly responsesByUrl: Record<string, string>) {}

    async get(url: string): Promise<string> {
        this.requestedUrls.push(url);
        const response = this.responsesByUrl[url];
        if (response === undefined) {
            throw new Error(`FakeHttpClient: no fixture registered for ${url}`);
        }
        return response;
    }

    async post(): Promise<never> {
        throw new Error('FakeHttpClient: post() not supported');
    }

    async put(): Promise<never> {
        throw new Error('FakeHttpClient: put() not supported');
    }

    async delete(): Promise<never> {
        throw new Error('FakeHttpClient: delete() not supported');
    }
}

describe('PsnProfilesTrophySource', () => {
    describe('getPlatinumTrophyData', () => {
        test('extracts rarity percentage and completion date from a completed row', async () => {
            const trophyUrl =
                'https://psnprofiles.com/trophies/12-grand-theft-auto-iv/Zephyr-pt';
            const httpClient = new FakeHttpClient({
                [trophyUrl]: fixture('trophy-completed.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            const data = await source.getPlatinumTrophyData(trophyUrl);

            // The captured row carries both rarity figures; 0.97% is the
            // site rarity PSNProfiles shows by default and the one the TP
            // ladder is calibrated against. Reading the hover value (0.3%)
            // instead would price this trophy at 2000 TP rather than 1250.
            expect(data.percentage).toBe(0.97);
            expect(data.completionDate.toISOString().slice(0, 10)).toBe('2021-09-02');
        });

        test('applies the blank-first-row workaround and reads the second row', async () => {
            const trophyUrl =
                'https://psnprofiles.com/trophies/11805-marvels-spider-man-miles-morales/Josh_Lopes';
            const httpClient = new FakeHttpClient({
                [trophyUrl]: fixture('trophy-blank-first-row.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            const data = await source.getPlatinumTrophyData(trophyUrl);

            expect(data.percentage).toBe(8.42);
            expect(data.completionDate.toISOString().slice(0, 10)).toBe('2022-01-01');
        });

        test('throws TrophyNotEarnedYet when the row is not marked completed', async () => {
            const trophyUrl = 'https://psnprofiles.com/trophies/99999-some-game/NunoGamerHDYT';
            const httpClient = new FakeHttpClient({
                [trophyUrl]: fixture('trophy-not-earned.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            await expect(source.getPlatinumTrophyData(trophyUrl)).rejects.toBeInstanceOf(
                TrophyNotEarnedYet,
            );
        });
    });

    describe('getProfileRank', () => {
        test('extracts world rank and country rank, stripping thousands separators', async () => {
            const httpClient = new FakeHttpClient({
                'https://psnprofiles.com/Zephyr-pt': fixture('profile-rank.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            const rank = await source.getProfileRank('Zephyr-pt');

            expect(rank.worldRank).toBe(26475);
            expect(rank.countryRank).toBe(331);
        });

        test('returns nulls for both ranks when the profile has no visible rank (banned)', async () => {
            const httpClient = new FakeHttpClient({
                'https://psnprofiles.com/oneeye_japan': fixture('profile-rank-banned.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            const rank = await source.getProfileRank('oneeye_japan');

            expect(rank.worldRank).toBeNull();
            expect(rank.countryRank).toBeNull();
        });
    });

    describe('getProfileTrophies', () => {
        test('returns only the platinum rows, resolved to absolute URLs, in document order', async () => {
            const httpClient = new FakeHttpClient({
                'https://psnprofiles.com/Josh_Lopes?completion=platinum&order=last-trophy&page=1':
                    fixture('profile-trophies-list.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            const urls = await source.getProfileTrophies('Josh_Lopes');

            expect(urls).toEqual([
                'https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes',
                'https://psnprofiles.com/trophies/11805-marvels-spider-man-miles-morales/Josh_Lopes',
            ]);
        });

        test('defaults to page 1 and paginates via the page argument', async () => {
            const httpClient = new FakeHttpClient({
                'https://psnprofiles.com/Josh_Lopes?completion=platinum&order=last-trophy&page=2':
                    fixture('profile-trophies-empty.html'),
            });
            const source = new PsnProfilesTrophySource(httpClient);

            const urls = await source.getProfileTrophies('Josh_Lopes', 2);

            expect(urls).toEqual([]);
            expect(httpClient.requestedUrls).toEqual([
                'https://psnprofiles.com/Josh_Lopes?completion=platinum&order=last-trophy&page=2',
            ]);
        });
    });
});
