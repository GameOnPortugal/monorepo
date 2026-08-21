import { inject, injectable } from 'inversify';
import { Cron } from 'croner';
import type { Job, JobContext, JobResult } from '../../Domain/Job/Job.ts';
import { JobAlreadyRunningError } from '../../Domain/Job/JobAlreadyRunningError.ts';
import type { JobStateRepository } from '../../Domain/Job/JobStateRepository.ts';
import type { JobReporter } from '../../Domain/Job/JobReporter.ts';
import { TYPES } from '../DependencyInjection/types.ts';
import type Logger from '../../Application/Logger/Logger.ts';

interface RegisteredJob {
    job: Job;
    cron: Cron;
    /**
     * Whether the scheduler may start this job on a tick. A job registered
     * with `scheduled: false` is still fully addressable by hand
     * (`listJobs`, `runNow`) — see `register`.
     */
    scheduled: boolean;
}

export interface RegisterOptions {
    /** Defaults to true. `false` registers the job for manual runs only. */
    scheduled?: boolean;
}

const DEFAULT_TICK_INTERVAL_MS = 60_000;
const DEFAULT_WORK_LIMIT = 200;

/**
 * The in-process replacement for the deleted `scheduler/` container (M6.1).
 *
 * Design, and why:
 *
 * - **Restart safety.** The container redeploys on every merge to `main`, so
 *   a naive `setInterval` would run a weekly job twice or never depending on
 *   deploy timing. Instead, "is this job due" is computed from the cron
 *   schedule plus the *persisted* `lastRunAt` (JobStateRepository, table
 *   `job_runs`) rather than trusted in-memory state — a fresh process
 *   started mid-week correctly does nothing until the next scheduled slot,
 *   and a process that missed a slot entirely (bot was down) catches up on
 *   its next tick after boot rather than waiting for the slot to come around
 *   again.
 * - **Overlap protection.** `running` is a plain in-memory Set, populated
 *   synchronously (before the first `await`) the instant a run starts, so a
 *   slow run cannot be re-entered by the next tick or a concurrent manual
 *   `runNow` — see the tests for why this matters (JS is single-threaded,
 *   but `tick()` does not await individual job runs, so two ticks can
 *   otherwise race).
 * - **Graceful shutdown.** `stop()` clears the interval immediately (no new
 *   ticks) and then awaits whatever is currently in flight, so a job
 *   finishes cleanly instead of being torn down mid-write. See `stop()`.
 */
@injectable()
export class JobRunner {
    private readonly jobs = new Map<string, RegisteredJob>();
    private readonly running = new Set<string>();
    private readonly inFlight = new Map<string, Promise<void>>();
    private readonly lastRunCache = new Map<string, Date>();
    private readonly tickIntervalMs: number;
    private readonly defaultWorkLimit: number;
    private timer: ReturnType<typeof setInterval> | undefined;
    // Only true once stop() has been called — tickOnce()/runNow() work fine
    // before start() is ever called (useful for tests and for the manual
    // console entry point, which never calls start() at all).
    private stopped = false;

    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.JobStateRepository) private readonly jobStateRepository: JobStateRepository,
        @inject(TYPES.JobReporter) private readonly reporter: JobReporter,
    ) {
        this.tickIntervalMs = Number(process.env.JOB_TICK_INTERVAL_MS ?? DEFAULT_TICK_INTERVAL_MS);
        this.defaultWorkLimit = Number(process.env.JOB_WORK_LIMIT ?? DEFAULT_WORK_LIMIT);
    }

    /**
     * Adds a job to the runner. Call this during wiring (inversify.config.ts)
     * before `start()` — a job registered after `start()` will simply not be
     * picked up until the process restarts, since jobs are also warmed from
     * persisted state once, at start.
     *
     * `scheduled: false` registers a job the ticker will never start on its
     * own, while leaving it runnable by hand. That distinction exists because
     * conflating the two made the documented enable-a-job runbook impossible:
     * a job gated behind an env flag was not in this map at all, so
     * `jobs:run <name> --dry-run` — the very command the operator is told to
     * preview with before flipping the flag — failed with `Unknown job`. The
     * only way to dry-run was to enable the schedule first, which is exactly
     * what the gate exists to prevent.
     */
    register(job: Job, options: RegisterOptions = {}): void {
        if (this.jobs.has(job.name)) {
            throw new Error(`Job "${job.name}" is already registered`);
        }

        this.jobs.set(job.name, {
            job,
            cron: new Cron(job.schedule),
            scheduled: options.scheduled ?? true,
        });
    }

    /** Names the ticker may start on its own — `listJobs()` minus the manual-only ones. */
    listScheduledJobs(): string[] {
        return [...this.jobs.values()].filter((r) => r.scheduled).map((r) => r.job.name);
    }

    listJobs(): string[] {
        return [...this.jobs.keys()];
    }

    isRunning(jobName: string): boolean {
        return this.running.has(jobName);
    }

    /**
     * Starts scheduling. Runs one catch-up pass immediately (covers "the bot
     * was down when a job was due") and then ticks every `tickIntervalMs`.
     */
    async start(): Promise<void> {
        this.stopped = false;
        await this.warmLastRunCache();
        this.tickOnce(new Date());
        this.timer = setInterval(() => this.tickOnce(new Date()), this.tickIntervalMs);
    }

    /**
     * Stops scheduling new runs and waits for anything already in flight to
     * finish. We chose "finish" over "abort" deliberately: jobs in this
     * system do a bounded number of sequential writes (the work limit), so
     * the worst-case wait is small and bounded, whereas aborting mid-loop
     * would need every job author to reason about partial state. If the
     * platform SIGKILLs before this resolves, that is outside our control —
     * the bounded work limit keeps that window small in practice.
     */
    async stop(): Promise<void> {
        this.stopped = true;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }

        await this.waitForIdle();
    }

    async waitForIdle(): Promise<void> {
        await Promise.allSettled([...this.inFlight.values()]);
    }

    /**
     * Runs a job outside of its schedule (the manual entry point — see
     * `RunJobConsoleCommand`). Still goes through overlap protection and
     * still persists/reports like a scheduled run would, unless `dryRun`.
     */
    async runNow(jobName: string, overrides: Partial<JobContext> = {}): Promise<JobResult> {
        const registered = this.jobs.get(jobName);
        if (!registered) {
            throw new Error(
                `Unknown job "${jobName}". Registered jobs: ${this.listJobs().join(', ') || '(none)'}`,
            );
        }

        if (this.running.has(jobName)) {
            throw new JobAlreadyRunningError(jobName);
        }

        const context: JobContext = {
            dryRun: overrides.dryRun ?? false,
            workLimit: overrides.workLimit ?? this.defaultWorkLimit,
        };

        return this.execute(registered.job, context);
    }

    /**
     * One scheduling pass: start every due, not-already-running job.
     * Public (rather than driven only by the internal setInterval) so it can
     * be called with a fixed `now` from a test, or by an operator wanting an
     * immediate "run whatever's due" check.
     *
     * Deliberately does not await the jobs it starts — a tick should return
     * fast. Overlap protection is what makes that safe: `running` is
     * populated synchronously inside `execute()` before any `await`.
     */
    tickOnce(now: Date = new Date()): void {
        if (this.stopped) return;

        for (const registered of this.jobs.values()) {
            if (this.stopped) break;
            // Manual-only: registered so it can be run by hand, but never
            // started by the ticker. See `register`.
            if (!registered.scheduled) continue;
            if (this.running.has(registered.job.name)) continue;
            if (!this.isDue(registered, now)) continue;

            const context: JobContext = { dryRun: false, workLimit: this.defaultWorkLimit };
            // execute() never rejects (it catches internally), but the .then()
            // form below also discards the JobResult, since inFlight is only
            // used to know *whether* something is still running, not what it returned.
            const promise: Promise<void> = this.execute(registered.job, context).then(
                () => undefined,
                () => undefined,
            );
            this.inFlight.set(registered.job.name, promise);
            void promise.finally(() => this.inFlight.delete(registered.job.name));
        }
    }

    private isDue(registered: RegisteredJob, now: Date): boolean {
        const [scheduledAt] = registered.cron.previousRuns(1, now);
        if (!scheduledAt) return false;

        const lastRun = this.lastRunCache.get(registered.job.name);
        return !lastRun || lastRun.getTime() < scheduledAt.getTime();
    }

    private async warmLastRunCache(): Promise<void> {
        for (const jobName of this.jobs.keys()) {
            const lastRunAt = await this.jobStateRepository.getLastRunAt(jobName);
            if (lastRunAt) {
                this.lastRunCache.set(jobName, lastRunAt);
            }
        }
    }

    /**
     * Runs one job to completion. Never throws — a throwing job must not
     * kill the runner, so any error (from the job itself, or from
     * persisting/reporting the outcome) is caught, logged, and folded into a
     * failed JobResult instead.
     */
    private async execute(job: Job, context: JobContext): Promise<JobResult> {
        this.running.add(job.name);
        const startedAt = new Date();
        this.logger.info('job.start', {
            job: job.name,
            dryRun: context.dryRun,
            workLimit: context.workLimit,
        });

        try {
            const result = await job.run(context);
            const durationMs = Date.now() - startedAt.getTime();
            this.logger.info('job.finish', {
                job: job.name,
                dryRun: context.dryRun,
                durationMs,
                ...result,
            });

            if (!context.dryRun) {
                this.lastRunCache.set(job.name, startedAt);
                await this.jobStateRepository.recordRun({
                    jobName: job.name,
                    lastRunAt: startedAt,
                    status: 'success',
                    summary: JSON.stringify(result),
                });
            }

            // Dry runs are previews, not events — never worth telling anyone about.
            if (!context.dryRun) {
                await this.safeReport({ jobName: job.name, context, durationMs, result });
            }

            return result;
        } catch (error: any) {
            const durationMs = Date.now() - startedAt.getTime();
            const message = error?.message ?? String(error);
            this.logger.error('job.failed', {
                job: job.name,
                dryRun: context.dryRun,
                durationMs,
                error: message,
            });

            if (!context.dryRun) {
                this.lastRunCache.set(job.name, startedAt);
                await this.jobStateRepository
                    .recordRun({
                        jobName: job.name,
                        lastRunAt: startedAt,
                        status: 'failed',
                        error: message,
                    })
                    .catch((persistError: any) =>
                        this.logger.error('job.record-run.failed', {
                            job: job.name,
                            error: persistError?.message ?? String(persistError),
                        }),
                    );
            }

            if (!context.dryRun) {
                await this.safeReport({ jobName: job.name, context, durationMs, error: message });
            }

            return {
                considered: 0,
                changed: 0,
                skipped: 0,
                failed: 1,
                details: { error: message },
            };
        } finally {
            this.running.delete(job.name);
        }
    }

    /** Observability must never fail the job it is reporting on — belt and braces on top of the reporter's own contract. */
    private async safeReport(outcome: Parameters<JobReporter['report']>[0]): Promise<void> {
        try {
            await this.reporter.report(outcome);
        } catch (error: any) {
            this.logger.error('job.report.threw', {
                job: outcome.jobName,
                error: error?.message ?? String(error),
            });
        }
    }
}
