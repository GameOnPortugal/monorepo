import { inject, injectable } from 'inversify';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { TYPES } from '../DependencyInjection/types';
import type { HttpClient } from '../../Domain/Http/HttpClient';
import type {
    PlatinumTrophyData,
    TrophyProfileRank,
    TrophySource,
} from '../../Domain/Trophy/TrophySource';
import { TrophyNotEarnedYet } from '../../Domain/Trophy/TrophyNotEarnedYet';
import { sleep } from '../../Application/Shared/sleep';

dayjs.extend(customParseFormat);

// PSN profile dates look like: 29th Jun 2021
// https://day.js.org/docs/en/parse/string-format
const PSN_PROFILE_DATE_FORMAT = 'Do MMM YYYY';

// A real, descriptive UA — PSNProfiles has no public API and this is a
// courtesy to whoever reads their access logs. Not the bare default
// "node"/"bun" UA, and not spoofed as a browser.
const USER_AGENT =
    'GameOnPortugalBot/1.0 (+https://github.com/GameOnPortugal/monorepo; Discord community trophy tracker)';

// PSNProfiles' robots.txt disallows a handful of paths (search, ajax
// endpoints) but not profile/trophy pages; it carries no explicit
// Crawl-delay. In the absence of one, one request per second per process is
// a conservative, well-established default for a single-threaded crawler
// against a site with no public API — enough to be a good citizen without
// making the sync job (M7.3) impractically slow over ~118 profiles.
const MIN_REQUEST_INTERVAL_MS = 1000;

interface HtmlTag {
    /** Raw attribute string, e.g. `class="rank" title="x"`. */
    attrs: string;
    /** Inner content between the opening and closing tag. */
    inner: string;
}

/**
 * Ported from `old-discord-bot/src/service/trophy/psnCrawlService.js`, which
 * used JSDOM + jQuery. Neither is a dependency here (M3.3 removed axios; no
 * HTML parser was ever a dependency of the rewrite) and the instruction for
 * this port is to avoid adding one — so this parses with small, scoped
 * regexes over specific known fragments of PSNProfiles' markup, the same
 * way the old bot's CSS selectors targeted specific known fragments.
 *
 * This is deliberately not a general HTML parser: it assumes the fragments
 * it scans (a stats block, a trophy table body, a games table) don't nest
 * same-named tags inside themselves, which holds for the shapes PSNProfiles
 * actually emits for these blocks. Fixtures for both shapes live under
 * `tests/Integration/Infrastructure/Trophy/fixtures/`.
 */
@injectable()
export class PsnProfilesTrophySource implements TrophySource {
    private static readonly BASE_URL = 'https://psnprofiles.com';

    private lastRequestAt = 0;

    constructor(@inject(TYPES.HttpClient) private readonly httpClient: HttpClient) {}

    public async getProfileRank(psnProfile: string): Promise<TrophyProfileRank> {
        const html = await this.fetchHtml(`${PsnProfilesTrophySource.BASE_URL}/${psnProfile}`);
        return this.parseProfileRank(html);
    }

    public async getProfileTrophies(psnProfile: string, page: number = 1): Promise<string[]> {
        const html = await this.fetchHtml(
            `${PsnProfilesTrophySource.BASE_URL}/${psnProfile}?completion=platinum&order=last-trophy&page=${page}`,
        );
        return this.parseProfileTrophies(html);
    }

    public async getPlatinumTrophyData(trophyUrl: string): Promise<PlatinumTrophyData> {
        const html = await this.fetchHtml(trophyUrl);
        return this.parsePlatinumTrophyData(html, trophyUrl);
    }

    // -- HTTP -----------------------------------------------------------
    //
    // TYPES.HttpClient already resolves to RetryHttpClient (wrapping
    // FetchHttpClient), which retries with backoff on any thrown error —
    // and FetchHttpClient throws on any non-2xx response, so 429s and 5xxs
    // already get retried without anything extra here. What's left for a
    // good citizen is a descriptive User-Agent and spacing requests out,
    // both below.

    private async fetchHtml(url: string): Promise<string> {
        await this.throttle();

        const response = await this.httpClient.get(url, {
            headers: { 'User-Agent': USER_AGENT },
        });

        return typeof response === 'string' ? response : String(response);
    }

    private async throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestAt;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
        }
        this.lastRequestAt = Date.now();
    }

    // -- Parsing ----------------------------------------------------------

    private parseProfileRank(html: string): TrophyProfileRank {
        const worldRankText = this.findTagByClass(html, 'span', 'rank')?.inner.trim();
        const countryRankText = this.findTagByClass(html, 'span', 'country-rank')?.inner.trim();

        return {
            worldRank: this.parseCommaSeparatedInt(worldRankText),
            countryRank: this.parseCommaSeparatedInt(countryRankText),
        };
    }

    private parseProfileTrophies(html: string): string[] {
        const urls: string[] = [];

        for (const row of this.findRowsByClass(html, 'platinum')) {
            const hrefMatch = row.inner.match(/<a[^>]*\shref="([^"]*)"/);
            if (hrefMatch?.[1]) {
                urls.push(`${PsnProfilesTrophySource.BASE_URL}${hrefMatch[1]}`);
            }
        }

        return urls;
    }

    private parsePlatinumTrophyData(html: string, trophyUrl: string): PlatinumTrophyData {
        // Scope to the <tbody> so a <thead> row never gets mistaken for the
        // (possibly blank) first data row below.
        const tbodyHtml = this.extractFirstTagInner(html, 'tbody') ?? html;
        const rows = this.extractRows(tbodyHtml);
        if (rows.length === 0) {
            throw new Error("Couldn't find trophy table body!");
        }

        // HACK, ported verbatim from the old bot: some trophy pages have a
        // blank row in the first position. Jump to the second one if so.
        let row = rows[0];
        if (row !== undefined && row.inner.trim() === '') {
            row = rows[1] as HtmlTag;
        }

        if (row === undefined) {
            throw new Error("Couldn't find trophy table body!");
        }

        const rowClass = this.extractAttr(row.attrs, 'class') ?? '';
        if (!this.hasClassToken(rowClass, 'completed')) {
            throw new TrophyNotEarnedYet(trophyUrl);
        }

        const percentageText = this.findTagByClass(row.inner, 'span', 'typo-top')?.inner.trim();
        if (!percentageText) {
            throw new Error("Couldn't find trophy percentage!");
        }
        const percentage = parseFloat(percentageText);

        const dateText = this.findTagByClass(row.inner, 'span', 'typo-top-date')?.inner.trim();
        if (!dateText) {
            throw new Error("Couldn't find completion date!");
        }

        const completionDate = dayjs(dateText, PSN_PROFILE_DATE_FORMAT);
        if (!completionDate.isValid()) {
            throw new Error(`Completion date "${dateText}" is invalid!`);
        }

        return { percentage, completionDate: completionDate.toDate() };
    }

    // -- Tiny regex HTML helpers ------------------------------------------

    private extractRows(html: string): HtmlTag[] {
        return this.matchTags(html, 'tr');
    }

    private findRowsByClass(html: string, classToken: string): HtmlTag[] {
        return this.extractRows(html).filter((row) =>
            this.hasClassToken(this.extractAttr(row.attrs, 'class') ?? '', classToken),
        );
    }

    /** First `<tag ...>...</tag>` (no nested same-name tags) whose `class` list includes `classToken`. */
    private findTagByClass(html: string, tag: string, classToken: string): HtmlTag | null {
        return (
            this.matchTags(html, tag).find((match) =>
                this.hasClassToken(this.extractAttr(match.attrs, 'class') ?? '', classToken),
            ) ?? null
        );
    }

    /** Inner content of the first `<tag ...>...</tag>` (no nested same-name tags), or null if absent. */
    private extractFirstTagInner(html: string, tag: string): string | null {
        const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return match?.[1] ?? null;
    }

    private matchTags(html: string, tag: string): HtmlTag[] {
        const tags: HtmlTag[] = [];
        const regex = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(html)) !== null) {
            tags.push({ attrs: match[1] ?? '', inner: match[2] ?? '' });
        }
        return tags;
    }

    private extractAttr(attrs: string, name: string): string | null {
        const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
        return match?.[1] ?? null;
    }

    private hasClassToken(classAttr: string, token: string): boolean {
        return classAttr.split(/\s+/).includes(token);
    }

    private parseCommaSeparatedInt(text: string | undefined): number | null {
        if (!text) {
            return null;
        }
        const value = parseInt(text.replace(/,/g, ''), 10);
        return isNaN(value) ? null : value;
    }
}
