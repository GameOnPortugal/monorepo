import type { WeeklyWinner } from './WeeklyWinner.ts';

export interface WeeklyWinnerRepository {
    /**
     * Upsert keyed by `weekStart` — one contest per week, which is what makes
     * both re-running the backfill and re-running a weekly job idempotent
     * rather than duplicating a week.
     */
    save(winner: WeeklyWinner): Promise<void>;

    findByWeekStart(weekStart: Date): Promise<WeeklyWinner | null>;

    /** Every decided week, most recent first — the Hall of Fame's query (M10.8). */
    findAll(): Promise<WeeklyWinner[]>;
}
