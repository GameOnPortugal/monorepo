import { describe, test, expect } from 'bun:test';
import {
    WeekScreenshotWinnerJob,
    type WeekScreenshotWinnerCommand,
} from '../../../../../src/Infrastructure/Job/Jobs/WeekScreenshotWinnerJob.ts';
import type { JobContext } from '../../../../../src/Domain/Job/Job.ts';

/**
 * WeekScreenshotWinnerJob only adapts the existing `week-screenshot-winner`
 * console command to the Job interface — it must not reimplement or change
 * its behaviour (that command is M6.4's territory, a parallel PR). So this
 * test fakes the command's `run()` (the only method the adapter calls) and
 * asserts the adapter passes the right CLI-shaped args through and maps the
 * 0/1 exit code to a JobResult, rather than re-testing winner-picking logic.
 */
class FakeWeekScreenshotWinnerCommand implements WeekScreenshotWinnerCommand {
    public seenArgs: any[] = [];
    public exitCode = 0;

    async run(inputArgs: any): Promise<number> {
        this.seenArgs.push(inputArgs);
        return this.exitCode;
    }
}

function context(overrides: Partial<JobContext> = {}): JobContext {
    return { dryRun: false, workLimit: 100, ...overrides };
}

describe('WeekScreenshotWinnerJob', () => {
    test('exposes a stable name and the Sunday 23:50 schedule', () => {
        const job = new WeekScreenshotWinnerJob(new FakeWeekScreenshotWinnerCommand());

        expect(job.name).toBe('week-screenshot-winner');
        expect(job.schedule).toBe('50 23 * * 0');
    });

    test('passes context.dryRun through as the CLI-shaped string arg', async () => {
        const command = new FakeWeekScreenshotWinnerCommand();
        const job = new WeekScreenshotWinnerJob(command);

        await job.run(context({ dryRun: true }));

        expect(command.seenArgs).toHaveLength(1);
        expect(command.seenArgs[0]).toEqual([undefined, 'true']);
    });

    test('a real (non-dry) run passes "false"', async () => {
        const command = new FakeWeekScreenshotWinnerCommand();
        const job = new WeekScreenshotWinnerJob(command);

        await job.run(context({ dryRun: false }));

        expect(command.seenArgs[0]).toEqual([undefined, 'false']);
    });

    test('maps a 0 exit code to a considered+changed result', async () => {
        const command = new FakeWeekScreenshotWinnerCommand();
        command.exitCode = 0;
        const job = new WeekScreenshotWinnerJob(command);

        const result = await job.run(context());

        expect(result).toEqual({ considered: 1, changed: 1, skipped: 0, failed: 0 });
    });

    test('maps a non-zero exit code to a failed result', async () => {
        const command = new FakeWeekScreenshotWinnerCommand();
        command.exitCode = 1;
        const job = new WeekScreenshotWinnerJob(command);

        const result = await job.run(context());

        expect(result).toEqual({ considered: 1, changed: 0, skipped: 0, failed: 1 });
    });
});
