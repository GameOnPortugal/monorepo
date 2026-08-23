import { TrophyProfileId } from './TrophyProfileId';

export interface TrophyProfileArray {
    id: string;
    userId: string | null;
    psnProfile: string | null;
    isBanned: boolean | null;
    hasLeft: boolean | null;
    isExcluded: boolean | null;
    createdAt: Date;
    updatedAt: Date;
    lastSyncedAt?: Date | null;
}

export class TrophyProfile {
    constructor(
        public readonly id: TrophyProfileId,
        public readonly userId: string | null,
        public readonly psnProfile: string | null,
        public readonly isBanned: boolean | null,
        public readonly hasLeft: boolean | null,
        public readonly isExcluded: boolean | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        /**
         * When `trophies:sync` last finished walking this profile on
         * PSNProfiles — stamped by `TrophyProfileRepository.markSynced`, not
         * by any of the write paths that build this entity. `null` means
         * "never walked by the job", which is the honest state for every row
         * that predates it. Last and defaulted so the existing positional
         * call sites (all of which are creating a profile, and so have
         * nothing to say about syncing) keep compiling unchanged.
         */
        public readonly lastSyncedAt: Date | null = null,
    ) {}

    public static fromArray(array: TrophyProfileArray): TrophyProfile {
        return new TrophyProfile(
            TrophyProfileId.fromString(array.id),
            array.userId,
            array.psnProfile,
            array.isBanned,
            array.hasLeft,
            array.isExcluded,
            array.createdAt,
            array.updatedAt,
            array.lastSyncedAt ?? null,
        );
    }
}
