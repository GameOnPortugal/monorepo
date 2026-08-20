export type JobRunStatus = 'success' | 'failed';

/**
 * A persisted record of "the runner attempted job X at time Y". This is the
 * restart-safety mechanism (M6.1): the runner compares a job's schedule
 * against the last persisted `lastRunAt` rather than trusting an in-memory
 * timer, so a redeploy can't cause the same scheduled slot to run twice, and
 * a missed slot (bot was down) gets picked up on the next tick after boot.
 */
export interface JobRunRecord {
    jobName: string;
    /** When the run was attempted (not when it finished). */
    lastRunAt: Date;
    status: JobRunStatus;
    /** Human-readable summary of the JobResult, for the record only — not parsed back. */
    summary?: string;
    /** Error message, present when status is 'failed'. */
    error?: string;
}
