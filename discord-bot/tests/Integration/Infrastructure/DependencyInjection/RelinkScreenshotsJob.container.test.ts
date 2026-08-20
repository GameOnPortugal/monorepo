import { describe, test, expect } from 'bun:test';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { RelinkScreenshotsJob } from '../../../../src/Infrastructure/Job/Jobs/RelinkScreenshotsJob';
import { JobRunner } from '../../../../src/Infrastructure/Job/JobRunner';

/**
 * Cross-cutting rule 6: "nothing is reachable until it is bound". Asserts
 * both that the container can actually build RelinkScreenshotsJob (every
 * constructor dependency resolves) and that it registered itself with the
 * JobRunner, mirroring WeekScreenshotWinnerJob's own wiring.
 */
describe('DI container — RelinkScreenshotsJob', () => {
    test('resolves RelinkScreenshotsJob without throwing', () => {
        let instance: RelinkScreenshotsJob | undefined;

        expect(() => {
            instance = myContainer.get(RelinkScreenshotsJob);
        }).not.toThrow();

        expect(instance).toBeInstanceOf(RelinkScreenshotsJob);
    });

    test('is registered with the JobRunner', () => {
        const jobRunner = myContainer.get<JobRunner>(JobRunner);

        expect(jobRunner.listJobs()).toContain('screenshots-relink');
    });
});
