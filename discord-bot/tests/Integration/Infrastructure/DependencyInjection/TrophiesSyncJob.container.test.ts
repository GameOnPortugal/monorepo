import { describe, test, expect } from 'bun:test';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TrophiesSyncJob } from '../../../../src/Infrastructure/Job/Jobs/TrophiesSyncJob';
import { JobRunner } from '../../../../src/Infrastructure/Job/JobRunner';
import FixOldTrophies from '../../../../src/Ui/Cli/FixOldTrophies';

/**
 * M7.3/M7.7: "Nothing is reachable until it is bound"
 * (`Infrastructure/DependencyInjection/inversify.config.ts` — see AGENT.md).
 * This asserts the container can actually build `TrophiesSyncJob` and
 * `FixOldTrophies` regardless of scheduling.
 *
 * `TrophiesSyncJob`'s registration with the shared `JobRunner` (M6.1) is
 * gated by `TROPHIES_SYNC_ENABLED` (unset by default — see
 * `inversify.config.ts` and this job's own doc comment for why: merging to
 * `main` deploys, and an unconditionally-scheduled run would write
 * moderation flags on real members before anyone had watched a dry run).
 * The test environment sets no `TROPHIES_SYNC_ENABLED`, so this pins the
 * safe default the same way `MediaStorage.container.test.ts` pins the
 * S3-unset fallback: **not** scheduled, but still fully resolvable and
 * still runnable by hand (`bun run:command jobs:run trophies:sync
 * --dry-run`) — see `TrophiesSyncJob.test.ts` for coverage of `run()`
 * itself, which never goes through the scheduler at all.
 */
describe('DI container — TrophiesSyncJob / FixOldTrophies', () => {
    test('resolves TrophiesSyncJob without throwing', () => {
        expect(() => myContainer.get(TrophiesSyncJob)).not.toThrow();
    });

    test('resolves FixOldTrophies without throwing', () => {
        expect(() => myContainer.get(FixOldTrophies)).not.toThrow();
    });

    test('trophies:sync is NOT scheduled by default (TROPHIES_SYNC_ENABLED is unset in tests)', () => {
        expect(process.env.TROPHIES_SYNC_ENABLED).not.toBe('true');

        const jobRunner = myContainer.get(JobRunner);

        expect(jobRunner.listScheduledJobs()).not.toContain('trophies:sync');
    });

    test('trophies:sync is still registered, so it can be dry-run by hand', () => {
        // The whole point of the opt-in gate is that an operator previews a
        // run before scheduling it. That preview goes through
        // `jobs:run trophies:sync --dry-run`, which resolves the job out of
        // the JobRunner — so being unscheduled must not make it unreachable.
        expect(process.env.TROPHIES_SYNC_ENABLED).not.toBe('true');

        const jobRunner = myContainer.get(JobRunner);

        expect(jobRunner.listJobs()).toContain('trophies:sync');
    });
});
