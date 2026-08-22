import type { Trophy } from './Trophy';
import type { TrophyId } from './TrophyId';
import type { TrophyRankData } from './TrophyRankData';
import type { CatchUpSummary } from './CatchUpSummary';
import type { TrophyProfileId } from './TrophyProfileId';
import type { UserPosition } from './UserPosition';

export interface TrophyRepository {
    save(trophy: Trophy): Promise<void>;

    /**
     * @throws RecordNotFound
     */
    get(id: TrophyId): Promise<Trophy>;

    delete(id: TrophyId): Promise<void>;

    findByProfile(profileId: string): Promise<Trophy[]>;

    /**
     * Read-only existence check for the same (profile, url) pair `create()`
     * enforces. The `trophies:sync` job (M7.3) uses this in `--dry-run`
     * mode, where it must preview whether a claim *would* collide without
     * ever calling the writing `create()` path.
     */
    existsByProfileAndUrl(profileId: string, url: string): Promise<boolean>;

    /**
     * Creates and saves a new trophy for a profile, enforcing one claim per
     * (profile, url) pair — the write-side counterpart of
     * `TrophyAlreadyClaimed`. Ported from the old bot's
     * `trophyManager.js#create` (check-then-create). The `trophies:sync`
     * job (M7.3) catches `TrophyAlreadyClaimed` to detect catch-up mode's
     * stopping point: the first already-claimed trophy it hits walking a
     * profile's pages newest-first.
     *
     * @throws TrophyAlreadyClaimed if this profile has already claimed this url.
     */
    create(profileId: string, url: string, points: number, completionDate: Date): Promise<Trophy>;

    /**
     * Rows with no `completionDate` — the backfill target for the
     * `trophies:fix-old` console command (M7.7). Bounded by `limit` so a
     * single invocation is predictable in size; idempotent because a fixed
     * row simply stops matching this query.
     */
    findMissingCompletionDate(limit: number): Promise<Trophy[]>;

    /**
     * `offset` defaults to 0 (appended, not inserted, so every pre-M7.6 call
     * site with a positional `(limit, monthFilter)` call keeps compiling)
     * (M7.6) — pagination support for `/trophy rank`'s buttons.
     */
    getTopMonthlyHunters(
        limit: number,
        monthFilter: Date,
        offset?: number,
    ): Promise<TrophyRankData[]>;

    getTopSinceCreationHunters(limit: number, offset?: number): Promise<TrophyRankData[]>;

    getTopLifetimeHunters(limit: number, offset?: number): Promise<TrophyRankData[]>;

    /**
     * Total number of ranked (non-excluded, at-least-one-trophy) profiles
     * for the same window `getTopMonthlyHunters` sums — the page-count half
     * of pagination (M7.6). Kept as a separate query, not folded into the
     * ranked-hunters query, so a page render never pays for a full-table
     * scan it does not need when it is not the page building the buttons.
     */
    countMonthlyHunters(monthFilter: Date): Promise<number>;

    countSinceCreationHunters(): Promise<number>;

    countLifetimeHunters(): Promise<number>;

    findUserPosition(userId: string): Promise<UserPosition>;

    /**
     * Per-member totals for trophies *earned* on or after `since`, newest
     * window first — the input to `trophies:catchup-announce` (the one-off
     * "the crawl is back and here is what it recovered" post).
     *
     * Filters on `completionDate`, not `createdAt`, deliberately: the
     * message tells a member what *they* achieved in that period, which is
     * about when they earned the platinum, not when this bot happened to
     * notice it.
     *
     * Excluded profiles and profiles with no linked Discord user are left
     * out — there is nobody to mention.
     */
    findCatchUpSummariesSince(since: Date): Promise<CatchUpSummary[]>;
}
