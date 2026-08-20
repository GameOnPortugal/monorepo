import type { JobContext, JobResult } from './Job.ts';

/**
 * What happened on one run of a job, handed to a JobReporter so it can decide
 * whether/what to post. Deliberately carries either a `result` or an `error`
 * (or neither, for a run the runner itself couldn't start) rather than a
 * boolean, so the reporter can apply a noise policy — see M6.8.
 */
export interface JobReportOutcome {
    jobName: string;
    context: JobContext;
    durationMs: number;
    result?: JobResult;
    error?: string;
}

/**
 * A port for "tell someone how a job run went" (M6.8). The Domain layer only
 * knows it exists — the Discord-specific implementation (which channel, what
 * the message looks like, the noise policy) lives in Infrastructure.
 *
 * Implementations must never throw: a broken reporter must not fail the job
 * it is reporting on.
 */
export interface JobReporter {
    report(outcome: JobReportOutcome): Promise<void>;
}
