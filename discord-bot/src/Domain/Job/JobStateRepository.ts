import type { JobRunRecord } from './JobRunRecord.ts';

/**
 * Persisted last-run state, keyed by job name. See JobRunRecord for why this
 * exists (restart safety across redeploys).
 */
export interface JobStateRepository {
    getLastRunAt(jobName: string): Promise<Date | null>;

    recordRun(record: JobRunRecord): Promise<void>;
}
