import type { Ad } from './Ad';
import type { AdId } from './AdId';

export interface AdRepository {
    save(ad: Ad): Promise<void>;

    /**
     * @throws RecordNotFound
     */
    get(id: AdId): Promise<Ad>;

    delete(id: AdId): Promise<void>;

    findByUserId(userId: string): Promise<Ad[]>;

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
