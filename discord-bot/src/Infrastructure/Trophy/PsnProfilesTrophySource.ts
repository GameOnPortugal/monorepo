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

    /**
     * The two stat boxes at the top of a profile. Real markup nests the
     * number inside an `<a>` *and* a label span:
     *
     *     <span class="rank stat grow red">
     *       <a href="/leaderboard/..."> 26,475<span>World Rank</span> </a>
     *     </span>
     *
     * so the inner content has to be read with a nesting-aware scan and then
     * flattened to text — a non-greedy `</span>` match stops at the *label's*
     * closing tag and yields `<a href=...` , which parses as NaN. That is not
     * a cosmetic bug: `TrophiesSyncJob` reads "both ranks null" as "this
     * profile is banned/private" and auto-excludes the member, so a parser
     * that always returns null would auto-exclude everyone it looked at.
     */
    private parseProfileRank(rawHtml: string): TrophyProfileRank {
        const html = this.stripComments(rawHtml);

        return {
            worldRank: this.parseCommaSeparatedInt(this.findTextByClass(html, 'span', 'rank')),
            countryRank: this.parseCommaSeparatedInt(
                this.findTextByClass(html, 'span', 'country-rank'),
            ),
        };
    }

    private parseProfileTrophies(rawHtml: string): string[] {
        const html = this.stripComments(rawHtml);
        const urls: string[] = [];

        for (const row of this.findRowsByClass(html, 'platinum')) {
            const hrefMatch = row.inner.match(/<a[^>]*\shref="([^"]*)"/);
            if (hrefMatch?.[1]) {
                urls.push(`${PsnProfilesTrophySource.BASE_URL}${hrefMatch[1]}`);
            }
        }

        return urls;
    }

    /**
     * A trophy page's platinum row, located by what it *is* rather than by
     * where it sits. The old "first row of the first `<tbody>`" rule was
     * written against a hand-made fixture; a real page has 13 `<tbody>`
     * elements, and the first two are the profile summary and the
     * base-game/DLC breakdown — neither of which carries a completion date.
     *
     * The platinum row is the one holding both the platinum icon and a
     * completion date, which is stable regardless of how many summary
     * tables PSNProfiles adds above the trophy list.
     */
    private parsePlatinumTrophyData(rawHtml: string, trophyUrl: string): PlatinumTrophyData {
        const row = this.findPlatinumRow(this.stripComments(rawHtml));
        if (row === null) {
            throw new Error("Couldn't find trophy table body!");
        }

        if (!this.hasClassToken(this.extractAttr(row.attrs, 'class') ?? '', 'completed')) {
            throw new TrophyNotEarnedYet(trophyUrl);
        }

        const percentageText = this.findRarityPercentage(row.inner);
        if (!percentageText) {
            throw new Error("Couldn't find trophy percentage!");
        }
        const percentage = parseFloat(percentageText);
        if (isNaN(percentage)) {
            throw new Error(`Trophy percentage "${percentageText}" is invalid!`);
        }

        // Flattened to text first: the real markup is
        // `<nobr>2<sup>nd</sup> Sep 2021</nobr>`, and dayjs cannot parse that
        // with the tags still in it.
        const dateText = this.findTextByClass(row.inner, 'span', 'typo-top-date');
        if (!dateText) {
            throw new Error("Couldn't find completion date!");
        }

        const completionDate = dayjs(dateText, PSN_PROFILE_DATE_FORMAT);
        if (!completionDate.isValid()) {
            throw new Error(`Completion date "${dateText}" is invalid!`);
        }

        return { percentage, completionDate: completionDate.toDate() };
    }

    /**
     * The platinum trophy's `<tr>`.
     *
     * Identified by `title="Platinum"`, which on a real page appears exactly
     * once — unlike `platinum-icon.png`, which also appears in the profile
     * summary and base-game/DLC tables above. Deliberately *not* keyed on
     * having a completion date: an unearned platinum has no date, and must
     * still be found so the caller can raise `TrophyNotEarnedYet` (which the
     * sync job skips) rather than a generic parse error (which it counts as
     * a failure).
     */
    private findPlatinumRow(html: string): HtmlTag | null {
        return (
            this.findRowWhere(html, (inner) => /title="Platinum"/.test(inner)) ??
            // Simpler markup with no per-trophy icon: fall back to the first
            // row carrying rarity/date cells at all.
            this.findRowWhere(html, (inner) => /typo-top(-date)?"/.test(inner))
        );
    }

    private findRowWhere(html: string, predicate: (inner: string) => boolean): HtmlTag | null {
        const openTag = /<tr\b([^>]*)>/g;
        let match: RegExpExecArray | null;

        while ((match = openTag.exec(html)) !== null) {
            const inner = this.balancedInner(html, 'tr', match.index);
            if (predicate(inner)) {
                return { attrs: match[1] ?? '', inner };
            }
        }

        return null;
    }

    /**
     * PSNProfiles renders *two* rarity figures per row: its own site rarity
     * (shown by default, in the `hover-hide` cell) and Sony's global figure
     * (revealed on hover, in `hover-show`). The TP ladder in
     * `calculateTrophyPoints` was calibrated against the site rarity — the
     * one the old jQuery scraper picked up because it was the only one
     * rendered at the time — so this deliberately reads `hover-hide` rather
     * than simply taking the first `typo-top` in the row, which is now the
     * hover value and would misprice every trophy.
     *
     * Verified against six trophies whose stored TP predates this change:
     * the four whose rarity has been stable since (50/100/250/500 TP) all
     * reproduce exactly. The two that do not are both 2021 releases whose
     * platinum has genuinely become more common since it was recorded —
     * rarity drift in the source data, not a parse error.
     */
    private findRarityPercentage(rowInner: string): string | null {
        const hoverHideCell = rowInner.search(/<td[^>]*\bclass="[^"]*\bhover-hide\b[^"]*"/);
        if (hoverHideCell >= 0) {
            const cell = this.balancedInner(rowInner, 'td', hoverHideCell);
            const text = this.findTextByClass(cell, 'span', 'typo-top');
            if (text) {
                return text;
            }
        }

        // Older/simpler markup renders a single rarity figure per row.
        return this.findTextByClass(rowInner, 'span', 'typo-top');
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

    /**
     * Inner content of the tag opening at `openIndex`, honouring nesting of
     * the same tag name. The non-greedy `matchTags` below cannot do this —
     * it stops at the first closing tag, which is wrong for every block on a
     * real PSNProfiles page that wraps a label span inside a stat span, or a
     * `<td>` inside a `<tr>` inside a `<table>`.
     */
    private balancedInner(html: string, tag: string, openIndex: number): string {
        const contentStart = html.indexOf('>', openIndex) + 1;
        const opening = new RegExp(`<${tag}\\b`, 'g');
        const closing = new RegExp(`</${tag}>`, 'g');
        let depth = 1;
        let cursor = contentStart;

        while (depth > 0) {
            opening.lastIndex = cursor;
            closing.lastIndex = cursor;
            const nextOpen = opening.exec(html);
            const nextClose = closing.exec(html);

            // Unbalanced markup: treat the rest of the document as content
            // rather than throwing — the callers all pattern-match on what
            // they find, so a too-long slice fails their checks safely.
            if (nextClose === null) {
                return html.slice(contentStart);
            }

            if (nextOpen !== null && nextOpen.index < nextClose.index) {
                depth++;
                cursor = nextOpen.index + 1;
                continue;
            }

            depth--;
            if (depth === 0) {
                return html.slice(contentStart, nextClose.index);
            }
            cursor = nextClose.index + 1;
        }

        return html.slice(contentStart);
    }

    /**
     * Flattened text of the first `<tag>` whose class list includes
     * `classToken` — tags stripped, entities and whitespace normalised, so
     * `<nobr>2<sup>nd</sup> Sep 2021</nobr>` reads as `2nd Sep 2021`.
     */
    private findTextByClass(html: string, tag: string, classToken: string): string | null {
        const opening = new RegExp(`<${tag}\\b([^>]*)>`, 'g');
        let match: RegExpExecArray | null;

        while ((match = opening.exec(html)) !== null) {
            if (this.hasClassToken(this.extractAttr(match[1] ?? '', 'class') ?? '', classToken)) {
                return this.textOf(this.balancedInner(html, tag, match.index));
            }
        }

        return null;
    }

    /**
     * Drops `<!-- ... -->` before anything is scanned. Commented-out markup
     * is still markup to a regex, so a stale block left in the page source
     * would otherwise be indistinguishable from the live one — and would win,
     * since these helpers all take the *first* match. Repeats to a fixed
     * point so a crafted `<!--<!---->` can't leave a dangling `<!--` behind.
     */
    private stripComments(html: string): string {
        return this.replaceToFixedPoint(html, /<!--[\s\S]*?-->/g, '');
    }

    /** Markup → plain text: drop tags, decode the few entities PSNProfiles emits, collapse whitespace. */
    private textOf(html: string): string {
        return this.stripTags(html)
            .replace(/&nbsp;/g, ' ')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Strips tags to a fixed point so a crafted `<scr<script>ipt>` can't leave a reassembled tag behind. */
    private stripTags(html: string): string {
        return this.replaceToFixedPoint(html, /<[^>]*>/g, '');
    }

    private replaceToFixedPoint(input: string, pattern: RegExp, replacement: string): string {
        let previous: string;
        let result = input;
        do {
            previous = result;
            result = result.replace(pattern, replacement);
        } while (result !== previous);
        return result;
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

    /**
     * Leading integer of a flattened stat, e.g. `26,475 World Rank` -> 26475.
     * Anchored to the start and matched explicitly rather than relying on
     * `parseInt` stopping at the first non-digit, so a stat box that ever
     * renders its label *before* its number fails loudly (null) instead of
     * silently returning a number parsed out of the wrong place.
     */
    private parseCommaSeparatedInt(text: string | null | undefined): number | null {
        if (!text) {
            return null;
        }

        const digits = text.trim().match(/^([\d,]+)/);
        if (digits?.[1] === undefined) {
            return null;
        }

        const value = parseInt(digits[1].replace(/,/g, ''), 10);
        return isNaN(value) ? null : value;
    }
}
