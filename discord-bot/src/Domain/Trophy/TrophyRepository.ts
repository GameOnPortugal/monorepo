import type { Trophy } from './Trophy';
import type { TrophyId } from './TrophyId';
import type { TrophyRankData } from './TrophyRankData';
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

    getTopMonthlyHunters(limit: number, monthFilter: Date): Promise<TrophyRankData[]>;

    getTopSinceCreationHunters(limit: number): Promise<TrophyRankData[]>;

    getTopLifetimeHunters(limit: number): Promise<TrophyRankData[]>;

    findUserPosition(userId: string): Promise<UserPosition>;
}
