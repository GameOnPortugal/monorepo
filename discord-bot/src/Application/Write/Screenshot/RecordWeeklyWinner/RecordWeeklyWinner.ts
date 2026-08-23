import type Command from '../../../../Domain/Command/Command.ts';
import type { WeeklyWinnerSource } from '../../../../Domain/Screenshot/WeeklyWinner.ts';

/**
 * M10.7 — persist the fact that a week of the screenshot contest was decided.
 *
 * Written from two places: `WeekScreenshotWinner` at the moment it announces
 * (`source: 'announced'`), and `screenshots:backfill-winners` when it
 * recovers an old announcement from channel history (`source: 'inferred'`).
 */
export class RecordWeeklyWinner implements Command {
    constructor(
        public readonly screenshotId: string,
        public readonly authorId: string | null,
        public readonly weekStart: Date,
        public readonly weekEnd: Date,
        public readonly voteCount: number | null,
        public readonly messageUrl: string | null,
        public readonly announcementMessageId: string | null,
        public readonly source: WeeklyWinnerSource,
    ) {}
}
