import { injectable } from 'inversify';
import { randomUUID } from 'crypto';
import type { AdSearchCriteria } from '../../../../../Domain/Marketplace/AdSearchCriteria';

/**
 * Backs `/marketplace search`'s Prev/Next buttons (M5.9).
 *
 * Trophies' pagination (M7.6, `RankPresenter`/`TrophyComponentHandler`)
 * encodes its *entire* state into the button's custom ID, which is what lets
 * it survive a bot restart and be clicked correctly days later. That works
 * there because every field is a bounded enum or a small integer. Search
 * criteria includes free-text pt-PT `keyword`/`zone` — Discord's custom ID is
 * capped at 100 characters (`CustomId.ts`) and cannot contain `:`, and
 * percent-encoding accented Portuguese text can *triple* its length, so the
 * same approach would either truncate criteria silently (a correctness bug:
 * page 2 would search something subtly different from page 1) or throw for
 * an ordinary two-word pt-PT query.
 *
 * So search criteria live here instead, keyed by a short opaque token that
 * *does* fit a custom ID (`mkt:search-page:<token>:<page>`), with a TTL. This
 * is a deliberate, narrower trade-off than trophies' — a restart or a stale
 * (>15 min) click loses the pagination, not the ability to search at all,
 * and `MarketplaceComponentHandler` fails closed with an ephemeral "run the
 * search again" reply rather than a stale or empty render. That trade-off is
 * fine for a marketplace snapshot (prices/stock change constantly anyway,
 * unlike a trophy leaderboard someone might page through days after it was
 * posted).
 *
 * In-process only, matching this codebase's no-cache-layer convention
 * elsewhere (no Redis, no shared store) — a restart losing in-flight
 * pagination is an acceptable cost for a bot with a single running instance.
 */
@injectable()
export class SearchCriteriaStore {
    private readonly entries = new Map<
        string,
        { criteria: AdSearchCriteria; pageSize: number; expiresAt: number }
    >();

    constructor(private readonly ttlMs: number = 15 * 60 * 1000) {}

    /** Stores `criteria`/`pageSize` and returns the token to embed in a custom ID. */
    put(criteria: AdSearchCriteria, pageSize: number): string {
        this.sweep();
        const token = randomUUID().replace(/-/g, '').slice(0, 16);
        this.entries.set(token, { criteria, pageSize, expiresAt: Date.now() + this.ttlMs });
        return token;
    }

    /** Returns `null` for an unknown or expired token — the caller's cue to fail closed. */
    get(token: string): { criteria: AdSearchCriteria; pageSize: number } | null {
        this.sweep();
        const entry = this.entries.get(token);
        return entry ? { criteria: entry.criteria, pageSize: entry.pageSize } : null;
    }

    /** Lazy eviction on access rather than a timer — no background interval to leak or need shutdown handling. */
    private sweep(): void {
        const now = Date.now();
        for (const [token, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.entries.delete(token);
            }
        }
    }
}
