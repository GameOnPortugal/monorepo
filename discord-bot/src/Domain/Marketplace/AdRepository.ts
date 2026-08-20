import type { Ad } from './Ad';
import type { AdId } from './AdId';
import type { AdSearchCriteria } from './AdSearchCriteria';

/** Pagination window for `findByUserId`/`search` — DB-level `LIMIT`/`OFFSET`, never a JS `.slice()` over an unbounded fetch. */
export interface AdPageOptions {
    limit: number;
    offset: number;
}

export interface AdRepository {
    save(ad: Ad): Promise<void>;

    /**
     * @throws RecordNotFound
     */
    get(id: AdId): Promise<Ad>;

    delete(id: AdId): Promise<void>;

    /**
     * A user's own non-deleted ads, newest first. `options` is optional and
     * additive (M5.8): omitting it keeps the pre-pagination behaviour (every
     * row) that autocomplete and the lifecycle jobs still rely on: only
     * `/marketplace list`'s presenter needs a bounded page.
     */
    findByUserId(userId: string, options?: AdPageOptions): Promise<Ad[]>;

    /** Total non-deleted ads for a user — pairs with `findByUserId`'s `options` to compute `AdPage.totalPages` (M5.8). */
    countByUserId(userId: string): Promise<number>;

    /**
     * How many of a user's ads are currently `active` — the 10-active-ads
     * limit (M5.10) reads this rather than filtering `findByUserId`'s
     * result in JS, so the check is one indexed COUNT query
     * (`@@index([author_id, status])`), not "fetch everything, count in
     * memory" that gets slower as a seller's history grows.
     */
    countActiveByUserId(userId: string): Promise<number>;

    /**
     * Active listings matching `criteria` (M5.9's `/marketplace search`),
     * most-recently-bumped first, newest-created as the tiebreak. Filtering
     * happens entirely in the database — see AdSearchCriteria.ts's doc
     * comment for why that matters here.
     */
    search(criteria: AdSearchCriteria, options: AdPageOptions): Promise<Ad[]>;

    /** Total active listings matching `criteria` — pairs with `search()` to compute `AdPage.totalPages`. */
    countSearch(criteria: AdSearchCriteria): Promise<number>;

    /**
     * Active ads with no postable message (`message_id` empty or null) — the
     * 28 rows from the M0.1 write-back bug, plus anything that repeats that
     * shape in future. M6.5 expires these directly: there is nothing to
     * prompt about (no message to point the owner at, nothing to remove).
     */
    findOrphanedActive(limit: number): Promise<Ad[]>;

    /**
     * Active ads that have a real message but have gone untouched (no bump,
     * and no bump means "since creation") since before `idleBefore` — M6.5's
     * "14 days idle" trigger for the renewal DM. Ordered oldest-idle-first so
     * a work-limited or grace-capped run makes progress on the longest-idle
     * backlog first rather than an arbitrary subset.
     */
    findIdleActive(idleBefore: Date, limit: number): Promise<Ad[]>;

    /**
     * Ads currently `pending_renewal` whose own response deadline
     * (`expires_at`, repurposed while in this status — see
     * `AdStatus.pendingRenewal`'s doc comment) is at or before `now`. Each
     * row's `expires_at` was set individually to *its* prompt time + 72h by
     * `MarkAdPendingRenewalHandler`, so the comparison here is against `now`
     * directly — not `now` minus another 72h, which would double the wait.
     * M6.5 expires these on silence.
     */
    findAwaitingResponse(now: Date, limit: number): Promise<Ad[]>;

    /**
     * Every non-deleted `active` ad, orphaned or not — `ads:reconcile`
     * (M6.6) buckets them itself (message to check vs nothing to check), so
     * this intentionally does not filter on `message_id`.
     */
    findAllActive(limit: number): Promise<Ad[]>;
}
