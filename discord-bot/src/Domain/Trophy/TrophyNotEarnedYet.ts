/**
 * Thrown by a `TrophySource` when the profile's first (or blank-workaround
 * second) trophy row exists but is not marked completed — i.e. the plat
 * hasn't been earned yet.
 *
 * Ported from the plain `Error('User hasn't earned the plat trophy yet!')`
 * thrown in `old-discord-bot/src/service/trophy/psnCrawlService.js#getPlatTrophyData`.
 */
export class TrophyNotEarnedYet extends Error {
    constructor(public readonly trophyUrl: string) {
        super(`Plat trophy at ${trophyUrl} hasn't been earned yet`);
        this.name = 'TrophyNotEarnedYet';
    }
}
