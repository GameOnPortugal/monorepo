import { describe, test, expect } from 'bun:test';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TrophiesSyncJob } from '../../../../src/Infrastructure/Job/Jobs/TrophiesSyncJob';
import { JobRunner } from '../../../../src/Infrastructure/Job/JobRunner';
import FixOldTrophies from '../../../../src/Ui/Cli/FixOldTrophies';

/**
 * M7.3/M7.7: "Nothing is reachable until it is bound"
 * (`Infrastructure/DependencyInjection/inversify.config.ts` — see AGENT.md).
 * This asserts the container can actually build `TrophiesSyncJob` and
 * `FixOldTrophies`, and that the sync job is registered with the shared
 * `JobRunner` (M6.1) — a job wired only into `inversify.config.ts` without a
 * `.register()` call would compile and resolve, but never run.
 */
describe('DI container — TrophiesSyncJob / FixOldTrophies', () => {
    test('resolves TrophiesSyncJob without throwing', () => {
        expect(() => myContainer.get(TrophiesSyncJob)).not.toThrow();
    });

    test('resolves FixOldTrophies without throwing', () => {
        expect(() => myContainer.get(FixOldTrophies)).not.toThrow();
    });

    test('trophies:sync is registered with the JobRunner', () => {
        const jobRunner = myContainer.get(JobRunner);

        expect(jobRunner.listJobs()).toContain('trophies:sync');
    });
});
