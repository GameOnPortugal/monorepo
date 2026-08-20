/**
 * One claim per (profile, trophy URL) pair.
 *
 * Ported from `old-discord-bot/src/exception/trophy/trophyAlreadyClaimedException.js`
 * (`TrophyAlreadyClaimedException`), thrown by
 * `old-discord-bot/src/service/trophy/trophyManager.js#create` when a
 * trophy row already exists for that profile + url. The sync job that
 * throws this on write (M7.3, not built in this PR) is expected to catch
 * it to implement catch-up mode: stop walking a profile's trophy pages the
 * first time this fires, unless running with `--all --profile=X`.
 */
export class TrophyAlreadyClaimed extends Error {
    constructor(
        public readonly profileId: string,
        public readonly trophyUrl: string,
    ) {
        super(`${trophyUrl} has already been claimed by profile ${profileId}`);
        this.name = 'TrophyAlreadyClaimed';
    }
}
