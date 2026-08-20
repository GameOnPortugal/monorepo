import { describe, test, expect } from 'bun:test';
import {
    WeekScreenshotWinnerJob,
    type WeekScreenshotWinnerCommand,
} from '../../../../../src/Infrastructure/Job/Jobs/WeekScreenshotWinnerJob.ts';
import type { JobContext } from '../../../../../src/Domain/Job/Job.ts';
import { parseWeekScreenshotWinnerArgs } from '../../../../../src/Ui/Cli/WeekScreenshotWinner.ts';

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

    test('passes context.dryRun through as the --dry-run flag', async () => {
        const command = new FakeWeekScreenshotWinnerCommand();
        const job = new WeekScreenshotWinnerJob(command);

        await job.run(context({ dryRun: true }));

        expect(command.seenArgs).toHaveLength(1);
        expect(command.seenArgs[0]).toEqual(['--dry-run']);
    });

    test('a real (non-dry) run passes no args at all', async () => {
        const command = new FakeWeekScreenshotWinnerCommand();
        const job = new WeekScreenshotWinnerJob(command);

        await job.run(context({ dryRun: false }));

        expect(command.seenArgs[0]).toEqual([]);
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

    /**
     * The regression test for the bug this adapter actually shipped with.
     *
     * Every test above fakes the command, so none of them ever fed the
     * adapter's arguments to the code that has to understand them. M6.1 (this
     * adapter) and M6.4 (the arg parser) were built in parallel against each
     * other's older shape, both were internally consistent, both suites were
     * green — and the first scheduled run in production failed with
     * `invalid date argument "undefined"`.
     *
     * So: run the adapter's real output through the real parser. This is the
     * seam that was untested, and it is the only place this class of bug can
     * be caught before a user sees it.
     */
    test('the args it emits are understood by the real parser', async () => {
        for (const dryRun of [true, false]) {
            const command = new FakeWeekScreenshotWinnerCommand();
            const job = new WeekScreenshotWinnerJob(command);

            await job.run(context({ dryRun }));

            const parsed = parseWeekScreenshotWinnerArgs(command.seenArgs[0]);

            expect(parsed.mode).toBe(dryRun ? 'dry-run' : 'public');
            // No date was supplied, so it must default to "now" — not throw,
            // and not land on some accidentally-parsed date.
            expect(Number.isNaN(parsed.date.getTime())).toBe(false);
            expect(Math.abs(parsed.date.getTime() - Date.now())).toBeLessThan(60_000);
        }
    });

    test('a stray nullish arg never becomes the string "undefined"', () => {
        // Defence in depth: even if some future caller reintroduces the
        // positional shape, a missing value must mean "not supplied".
        const parsed = parseWeekScreenshotWinnerArgs([undefined, null, '--dry-run']);

        expect(parsed.mode).toBe('dry-run');
        expect(Number.isNaN(parsed.date.getTime())).toBe(false);
    });
});
