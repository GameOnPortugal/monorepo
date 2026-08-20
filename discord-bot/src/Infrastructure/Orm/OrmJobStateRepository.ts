import { PrismaClient } from '@prisma/client';
import { inject, injectable } from 'inversify';
import { TYPES } from '../DependencyInjection/types';
import type { JobStateRepository } from '../../Domain/Job/JobStateRepository.ts';
import type { JobRunRecord } from '../../Domain/Job/JobRunRecord.ts';

@injectable()
export default class OrmJobStateRepository implements JobStateRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async getLastRunAt(jobName: string): Promise<Date | null> {
        const record = await this.prismaClient.jobRun.findUnique({
            where: { job_name: jobName },
        });

        return record?.last_run_at ?? null;
    }

    async recordRun(record: JobRunRecord): Promise<void> {
        const data = {
            last_run_at: record.lastRunAt,
            status: record.status,
            summary: record.summary ?? null,
            error: record.error ?? null,
        };

        await this.prismaClient.jobRun.upsert({
            where: { job_name: record.jobName },
            update: data,
            create: { job_name: record.jobName, ...data },
        });
    }
}
