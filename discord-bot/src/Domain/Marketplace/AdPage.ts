import type { Ad } from './Ad';

/**
 * One page of ads (M5.8's `/marketplace list` pagination, M5.9's
 * `/marketplace search`) — same shape as trophies' `RankPage`
 * (`Domain/Trophy/RankPage.ts`), reused here rather than re-invented: a
 * caller only ever has to render `data` and build Prev/Next off
 * `page`/`totalPages`, never re-derive whether a page number is sane.
 *
 * `page`/`totalPages` are already clamped into `[1, totalPages]` by the
 * handler that produces this before it ever reaches a presenter — a button
 * clicked against a list that has since shrunk (an ad sold, expired, or was
 * deleted between page loads) still renders a page that exists.
 * `totalPages` is always >= 1, even for zero results, so "empty" and
 * "out of range" are never confused.
 */
export interface AdPage {
    readonly data: Ad[];
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
    readonly totalCount: number;
}
