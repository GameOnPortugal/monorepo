import { describe, test, expect, beforeEach } from 'bun:test';
import { JobRunner } from '../../../../src/Infrastructure/Job/JobRunner.ts';
import type { Job, JobContext, JobResult } from '../../../../src/Domain/Job/Job.ts';
import type { JobStateRepository } from '../../../../src/Domain/Job/JobStateRepository.ts';
import type { JobRunRecord } from '../../../../src/Domain/Job/JobRunRecord.ts';
import type { JobReportOutcome, JobReporter } from '../../../../src/Domain/Job/JobReporter.ts';
import { JobAlreadyRunningError } from '../../../../src/Domain/Job/JobAlreadyRunningError.ts';
import InMemoryLogger from '../../../Helper/InMemoryLogger.ts';
import Logger from '../../../../src/Application/Logger/Logger.ts';

/**
 * JobRunner is the M6.1 scheduler that replaces the deleted `scheduler/`
 * container. These tests hand-roll fakes (no mocking library, matching the
 * rest of the repo) and drive the runner directly rather than through
 * inversify/DB, since none of this depends on Prisma or Discord.
 */

class FakeJobStateRepository implements JobStateRepository {
    public records: JobRunRecord[] = [];
    private lastRunByJob = new Map<string, Date>();

    async getLastRunAt(jobName: string): Promise<Date | null> {
        return this.lastRunByJob.get(jobName) ?? null;
    }

    async recordRun(record: JobRunRecord): Promise<void> {
        this.records.push(record);
        this.lastRunByJob.set(record.jobName, record.lastRunAt);
    }
}

class FakeJobReporter implements JobReporter {
    public outcomes: JobReportOutcome[] = [];
    public shouldThrow = false;

    async report(outcome: JobReportOutcome): Promise<void> {
        this.outcomes.push(outcome);
        if (this.shouldThrow) {
            throw new Error('reporter exploded');
        }
    }
}

/** A job that records how it was invoked and lets a test control its behaviour. */
class ScriptedJob implements Job {
    public callCount = 0;
    public seenContexts: JobContext[] = [];
    public behaviour: (context: JobContext, call: number) => Promise<JobResult> = async () => ({
        considered: 0,
        changed: 0,
        skipped: 0,
        failed: 0,
    });

    constructor(
        public readonly name: string,
        public readonly schedule: string = '* * * * *',
    ) {}

    async run(context: JobContext): Promise<JobResult> {
        this.callCount++;
        this.seenContexts.push(context);
        return this.behaviour(context, this.callCount);
    }
}

function createRunner(jobStateRepository: JobStateRepository, reporter: JobReporter) {
    const logger = new Logger([new InMemoryLogger()]);
    return new JobRunner(logger, jobStateRepository, reporter);
}

describe('JobRunner', () => {
    let jobStateRepository: FakeJobStateRepository;
    let reporter: FakeJobReporter;

    beforeEach(() => {
        jobStateRepository = new FakeJobStateRepository();
        reporter = new FakeJobReporter();
    });

    test('runNow runs a registered job and reports its counts', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('demo-job');
        job.behaviour = async () => ({ considered: 5, changed: 2, skipped: 3, failed: 0 });
        runner.register(job);

        const result = await runner.runNow('demo-job');

        expect(result).toEqual({ considered: 5, changed: 2, skipped: 3, failed: 0 });
        expect(job.callCount).toBe(1);

        // Restart-safety state was persisted for a real (non-dry) run.
        expect(jobStateRepository.records).toHaveLength(1);
        expect(jobStateRepository.records[0]?.jobName).toBe('demo-job');
        expect(jobStateRepository.records[0]?.status).toBe('success');

        // Observability saw the outcome.
        expect(reporter.outcomes).toHaveLength(1);
        expect(reporter.outcomes[0]?.result).toEqual(result);
    });

    test('--dry-run performs no persisted writes', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('dry-run-job');
        let sawDryRun = false;
        job.behaviour = async (context) => {
            sawDryRun = context.dryRun;
            return { considered: 1, changed: 0, skipped: 0, failed: 0 };
        };
        runner.register(job);

        await runner.runNow('dry-run-job', { dryRun: true });

        expect(sawDryRun).toBe(true);
        // No last-run state was recorded — a dry run must not affect
        // restart-safety bookkeeping.
        expect(jobStateRepository.records).toHaveLength(0);
        expect(await jobStateRepository.getLastRunAt('dry-run-job')).toBeNull();
        // Dry runs are previews — nothing gets posted to the admin channel.
        expect(reporter.outcomes).toHaveLength(0);
    });

    test('the configured work limit reaches the job by default and via override', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('limited-job');
        const seenLimits: number[] = [];
        job.behaviour = async (context) => {
            seenLimits.push(context.workLimit);
            return { considered: 0, changed: 0, skipped: 0, failed: 0 };
        };
        runner.register(job);

        await runner.runNow('limited-job');
        await runner.runNow('limited-job', { workLimit: 7 });

        expect(seenLimits[0]).toBeGreaterThan(0); // the runner's default, not job-invented
        expect(seenLimits[1]).toBe(7);
    });

    test('overlap protection prevents a second concurrent run of the same job', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('slow-job');

        let releaseFirstRun: () => void = () => {};
        const firstRunGate = new Promise<void>((resolve) => {
            releaseFirstRun = resolve;
        });

        job.behaviour = async () => {
            await firstRunGate;
            return { considered: 1, changed: 1, skipped: 0, failed: 0 };
        };
        runner.register(job);

        const firstRun = runner.runNow('slow-job');
        // Give the first call's synchronous "mark as running" a tick to land.
        await Promise.resolve();

        expect(runner.isRunning('slow-job')).toBe(true);
        await expect(runner.runNow('slow-job')).rejects.toBeInstanceOf(JobAlreadyRunningError);

        releaseFirstRun();
        const result = await firstRun;

        expect(result.changed).toBe(1);
        expect(runner.isRunning('slow-job')).toBe(false);

        // Once the first run finished, the job can run again.
        await expect(runner.runNow('slow-job')).resolves.toBeDefined();
    });

    test('a scheduled tick does not re-enter a job that is still running from a previous tick', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        // Every minute, so any tick within the same minute is "due" unless
        // overlap protection stops it.
        const job = new ScriptedJob('ticking-job', '* * * * *');

        let releaseRun: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseRun = resolve;
        });
        job.behaviour = async () => {
            await gate;
            return { considered: 1, changed: 1, skipped: 0, failed: 0 };
        };
        runner.register(job);

        const now = new Date('2026-08-23T23:50:00.000Z'); // a Sunday, matches '* * * * *' trivially
        runner.tickOnce(now);
        // Second tick, same minute — must not start a second in-flight run.
        runner.tickOnce(now);

        expect(job.callCount).toBe(1);

        releaseRun();
        await runner.waitForIdle();

        expect(job.callCount).toBe(1);
    });

    test('a throwing job is caught, logged, and does not kill the runner', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('throwing-job');
        job.behaviour = async () => {
            throw new Error('boom');
        };
        runner.register(job);

        const result = await runner.runNow('throwing-job');

        expect(result.failed).toBe(1);
        expect(jobStateRepository.records[0]?.status).toBe('failed');
        expect(jobStateRepository.records[0]?.error).toContain('boom');
        expect(reporter.outcomes[0]?.error).toContain('boom');

        // The runner is still usable afterwards.
        expect(runner.isRunning('throwing-job')).toBe(false);
        const other = new ScriptedJob('another-job');
        other.behaviour = async () => ({ considered: 1, changed: 1, skipped: 0, failed: 0 });
        runner.register(other);
        await expect(runner.runNow('another-job')).resolves.toEqual({
            considered: 1,
            changed: 1,
            skipped: 0,
            failed: 0,
        });
    });

    test('the observability post failing does not fail the job', async () => {
        reporter.shouldThrow = true;
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('reported-job');
        job.behaviour = async () => ({ considered: 3, changed: 1, skipped: 2, failed: 0 });
        runner.register(job);

        const result = await runner.runNow('reported-job');

        expect(result).toEqual({ considered: 3, changed: 1, skipped: 2, failed: 0 });
        // The reporter was still invoked (and threw), it just didn't propagate.
        expect(reporter.outcomes).toHaveLength(1);
    });

    test('stop() stops scheduling and waits for an in-flight run to finish', async () => {
        const runner = createRunner(jobStateRepository, reporter);
        const job = new ScriptedJob('shutdown-job', '* * * * *');

        let releaseRun: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseRun = resolve;
        });
        job.behaviour = async () => {
            await gate;
            return { considered: 1, changed: 1, skipped: 0, failed: 0 };
        };
        runner.register(job);

        runner.tickOnce(new Date());
        expect(runner.isRunning('shutdown-job')).toBe(true);

        const stopPromise = runner.stop();
        releaseRun();
        await stopPromise;

        expect(job.callCount).toBe(1);
        expect(runner.isRunning('shutdown-job')).toBe(false);

        // Ticks are ignored after stop().
        runner.tickOnce(new Date());
        expect(job.callCount).toBe(1);
    });

    test('a manual-only job is runnable by hand but never started by a tick', async () => {
        // The regression this locks down: gating registration on an env flag
        // made the documented "dry-run it before you enable it" runbook
        // impossible, because the job was not in the runner's map at all and
        // `jobs:run trophies:sync --dry-run` failed with `Unknown job`.
        const job = new ScriptedJob('manual-only', '* * * * *');
        const runner = createRunner(jobStateRepository, reporter);
        runner.register(job, { scheduled: false });

        expect(runner.listJobs()).toContain('manual-only');
        expect(runner.listScheduledJobs()).not.toContain('manual-only');

        // Due by its cron, but the ticker must leave it alone.
        runner.tickOnce(new Date());
        await runner.waitForIdle();
        expect(job.callCount).toBe(0);

        const result = await runner.runNow('manual-only', { dryRun: true });
        expect(job.callCount).toBe(1);
        expect(result.failed).toBe(0);
    });

    test('a job registered without options stays scheduled by default', async () => {
        const job = new ScriptedJob('scheduled-by-default', '* * * * *');
        const runner = createRunner(jobStateRepository, reporter);
        runner.register(job);

        expect(runner.listScheduledJobs()).toContain('scheduled-by-default');

        runner.tickOnce(new Date());
        await runner.waitForIdle();
        expect(job.callCount).toBe(1);
    });

    test('runNow rejects an unknown job name', async () => {
        const runner = createRunner(jobStateRepository, reporter);

        await expect(runner.runNow('nonexistent')).rejects.toThrow(/Unknown job/);
    });
});
