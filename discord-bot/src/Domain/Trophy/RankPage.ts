import type { TrophyRankData } from './TrophyRankData';

/**
 * One page of a trophy leaderboard (M7.6).
 *
 * `page`/`totalPages` are already clamped into `[1, totalPages]` by
 * `GetRankHandler` by the time this leaves the Application layer — a caller
 * (a slash command, a button click years later against a shrunk leaderboard)
 * never has to re-derive "is this page number sane" itself, it only has to
 * render what it is given. `totalPages` is always >= 1, even for an empty
 * leaderboard, so "page 1 of 1, no data" and "page out of range" are never
 * confused with each other.
 */
export interface RankPage {
    readonly data: TrophyRankData[];
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
    readonly totalCount: number;
}
