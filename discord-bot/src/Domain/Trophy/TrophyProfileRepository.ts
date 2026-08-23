import type { TrophyProfile } from './TrophyProfile';
import type { TrophyProfileId } from './TrophyProfileId';

export interface TrophyProfileRepository {
    save: (trophyProfile: TrophyProfile) => Promise<void>;

    /**
     * @throws RecordNotFound
     */
    get(id: TrophyProfileId): Promise<TrophyProfile>;

    delete(id: TrophyProfileId): Promise<void>;

    /**
     * Stamps `lastSyncedAt` and nothing else — the one write `trophies:sync`
     * makes for a profile it merely walked without having to moderate it.
     *
     * Deliberately not `save()`: this runs once per profile per run, and a
     * whole-row upsert would make the hourly crawl rewrite every flag it
     * happens to be holding a stale copy of, turning a bookkeeping stamp
     * into a chance to clobber a moderation decision made in between.
     */
    markSynced(id: TrophyProfileId, syncedAt: Date): Promise<void>;

    findByUserId(userId: string): Promise<TrophyProfile | null>;

    findByPsnProfile(psnProfile: string): Promise<TrophyProfile | null>;

    /**
     * Every profile not already excluded from ranking — the candidate set
     * for the `trophies:sync` job (M7.3), mirroring the old bot's
     * `TrophyProfileManager.findAllNonExcluded`. A profile that becomes
     * excluded (auto-moderation flag, or manual) simply stops appearing
     * here on the next run, which is also why the sync job never needs to
     * "un-consider" a profile explicitly.
     */
    findAllNonExcluded(): Promise<TrophyProfile[]>;
}
