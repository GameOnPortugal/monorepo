/**
 * World rank + country rank for a PSN profile, as displayed on the
 * profile's stats page. Both are `null` when the profile has no visible
 * rank — the old bot used this to detect a banned PSNProfiles account
 * (see `old-discord-bot/src/service/trophy/psnCrawlService.js#getProfileRank`
 * and its caller in `scripts/parse-psn-profile.js`, which flags the local
 * `TrophyProfile` as banned + excluded when both are null).
 */
export interface TrophyProfileRank {
    worldRank: number | null;
    countryRank: number | null;
}

/**
 * Rarity + completion date for a single platinum trophy.
 */
export interface PlatinumTrophyData {
    /** Platinum rarity, e.g. `52.03` for "52.03%". */
    percentage: number;
    completionDate: Date;
}

/**
 * Port for the data source that produces trophy data — PSNProfiles today,
 * ported behind this interface precisely so it doesn't have to stay
 * PSNProfiles forever. Domain layer: describes what the bot needs, not how
 * it's served, and has zero framework imports.
 *
 * See `PsnProfilesTrophySource` (Infrastructure/Trophy) for the concrete
 * implementation, ported from `old-discord-bot/src/service/trophy/psnCrawlService.js`.
 */
export interface TrophySource {
    /**
     * World rank + country rank for a PSN profile.
     */
    getProfileRank(psnProfile: string): Promise<TrophyProfileRank>;

    /**
     * One page of platinum trophy URLs for a PSN profile, newest first.
     * Returns an empty array once past the last page — callers page until
     * they get an empty result (or hit an already-claimed trophy, in
     * catch-up mode — see M7.3).
     */
    getProfileTrophies(psnProfile: string, page?: number): Promise<string[]>;

    /**
     * Rarity percentage + completion date for a single platinum trophy.
     *
     * @throws TrophyNotEarnedYet if the profile hasn't earned this trophy yet.
     */
    getPlatinumTrophyData(trophyUrl: string): Promise<PlatinumTrophyData>;
}
