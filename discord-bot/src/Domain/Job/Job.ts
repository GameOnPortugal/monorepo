/**
 * The runner never has to be taught what a job does — it only needs a name,
 * a schedule and something that returns structured counts. Everything a job
 * author would otherwise have to remember (dry-run, a work limit, start/finish
 * logging, overlap protection, restart safety, reporting) lives in the runner
 * instead — see `src/Infrastructure/Job/JobRunner.ts`.
 *
 * Zero framework imports on purpose: this is a Domain-layer contract, not a
 * scheduling library binding.
 */

/**
 * What a single run of a job did, in counts rather than a bare boolean, so a
 * run can be judged from its log line / report alone.
 *
 * - `considered` — how many candidate items the job looked at.
 * - `changed`    — how many of those it actually wrote/mutated.
 * - `skipped`    — how many it deliberately left alone (already correct,
 *                  outside the work limit, etc).
 * - `failed`     — how many individual items failed (a job can partially
 *                  succeed; this is not the same as the whole run throwing).
 */
export interface JobResult {
    considered: number;
    changed: number;
    skipped: number;
    failed: number;
    /** Free-form extra detail for logs/reports — unmatched ids, reasons, etc. */
    details?: Record<string, unknown>;
}

/**
 * What every job gets from the runner without asking for it.
 */
export interface JobContext {
    /** When true, a job must not perform any write. */
    readonly dryRun: boolean;
    /** The maximum number of items a job should process in a single run. */
    readonly workLimit: number;
}

export interface Job {
    /** Stable, unique name — used for scheduling, logs, the manual CLI and persisted run state. */
    readonly name: string;
    /**
     * A standard cron expression (5 or 6 fields, croner's dialect — see
     * https://github.com/hexagon/croner). Sunday = weekday 0.
     * Example: `'50 23 * * 0'` = Sunday 23:50.
     */
    readonly schedule: string;

    run(context: JobContext): Promise<JobResult>;
}
