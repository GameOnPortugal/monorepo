/**
 * One member's worth of trophies recovered by a backfill — what
 * `trophies:catchup-announce` turns into a single "here is what you earned
 * while the crawl was down" message.
 *
 * `points` and `numTrophies` are aggregated in SQL rather than by loading
 * rows, because the whole point of this summary is to avoid pulling ~20
 * months of trophies into memory just to count them.
 */
export interface CatchUpSummary {
    userId: string;
    psnProfile: string;
    points: number;
    numTrophies: number;
    firstCompletionDate: Date;
    lastCompletionDate: Date;
}
