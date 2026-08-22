/**
 * A decided week of the screenshot contest, as persisted (M10.7).
 *
 * Named `WeeklyWinner` rather than `ScreenshotWinner` because that name is
 * already taken by the *live* candidate shape in
 * `Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinnerHandler.ts`
 * — that one is "the screenshot currently winning, computed from Discord
 * reactions right now"; this one is "the week the contest was decided, and
 * how". The Prisma model behind it is `ScreenshotWinner` / table
 * `screenshot_winners`.
 */
export type WeeklyWinnerSource = 'announced' | 'inferred';

export interface WeeklyWinnerArray {
    id: string;
    screenshotId: string;
    authorId: string | null;
    weekStart: Date;
    weekEnd: Date;
    voteCount: number | null;
    messageUrl: string | null;
    announcementMessageId: string | null;
    source: string;
}

export class WeeklyWinner {
    constructor(
        public readonly id: string,
        public readonly screenshotId: string,
        public readonly authorId: string | null,
        public readonly weekStart: Date,
        public readonly weekEnd: Date,
        public readonly voteCount: number | null,
        public readonly messageUrl: string | null,
        public readonly announcementMessageId: string | null,
        public readonly source: WeeklyWinnerSource,
    ) {}

    static fromArray(row: WeeklyWinnerArray): WeeklyWinner {
        return new WeeklyWinner(
            row.id,
            row.screenshotId,
            row.authorId,
            row.weekStart,
            row.weekEnd,
            row.voteCount,
            row.messageUrl,
            row.announcementMessageId,
            row.source === 'announced' ? 'announced' : 'inferred',
        );
    }

    toArray(): WeeklyWinnerArray {
        return {
            id: this.id,
            screenshotId: this.screenshotId,
            authorId: this.authorId,
            weekStart: this.weekStart,
            weekEnd: this.weekEnd,
            voteCount: this.voteCount,
            messageUrl: this.messageUrl,
            announcementMessageId: this.announcementMessageId,
            source: this.source,
        };
    }
}
