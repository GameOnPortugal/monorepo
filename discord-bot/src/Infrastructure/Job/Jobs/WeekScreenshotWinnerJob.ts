import { inject, injectable } from 'inversify';
import type { Job, JobContext, JobResult } from '../../../Domain/Job/Job.ts';
import WeekScreenshotWinner from '../../../Ui/Cli/WeekScreenshotWinner.ts';

/**
 * The interface WeekScreenshotWinnerJob actually depends on. Deliberately
 * narrower than the concrete `WeekScreenshotWinner` class (which also has
 * private constructor-injected fields) so a test can hand-roll a fake here
 * without a mocking library and without touching WeekScreenshotWinner.ts —
 * that file belongs to a parallel PR (M6.4) hardening its behaviour.
 */
export type WeekScreenshotWinnerCommand = Pick<WeekScreenshotWinner, 'run'>;

/**
 * Adapts the existing `week-screenshot-winner` console command to the Job
 * interface so the runner has one real, end-to-end job proving the scheduler
 * works (M6.1's acceptance bar). This is the *only* thing this file does —
 * WeekScreenshotWinner's own behaviour is untouched.
 *
 * The mapping to JobResult is deliberately coarse: WeekScreenshotWinner.run()
 * only returns a 0/1 exit code today, not structured per-item counts, so a
 * clean pass (winner announced, or honestly "no winner this week") is
 * reported as one considered/changed item, and a caught error as one failed
 * item. Once M6.4 hardens WeekScreenshotWinner with real counts, this
 * adapter should be updated to pass them through instead of synthesizing them.
 */
@injectable()
export class WeekScreenshotWinnerJob implements Job {
    public readonly name = 'week-screenshot-winner';
    // Sunday 23:50 — see docs/plans/02-scheduler-and-lifecycle.md's job table.
    public readonly schedule = '50 23 * * 0';

    constructor(
        @inject(WeekScreenshotWinner) private readonly command: WeekScreenshotWinnerCommand,
    ) {}

    async run(context: JobContext): Promise<JobResult> {
        // WeekScreenshotWinner reads its date/dry-run args as CLI-shaped
        // strings — `undefined` means "today" in its own logic.
        const exitCode = await this.command.run([undefined, context.dryRun ? 'true' : 'false']);

        if (exitCode === 0) {
            return { considered: 1, changed: 1, skipped: 0, failed: 0 };
        }

        return { considered: 1, changed: 0, skipped: 0, failed: 1 };
    }
}
