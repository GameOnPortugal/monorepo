/**
 * Overlap protection: thrown by the runner when a job is asked to start
 * (scheduled tick or manual `runNow`) while a previous run of the same job
 * is still in flight.
 */
export class JobAlreadyRunningError extends Error {
    constructor(jobName: string) {
        super(`Job "${jobName}" is already running`);
        this.name = 'JobAlreadyRunningError';
    }
}
