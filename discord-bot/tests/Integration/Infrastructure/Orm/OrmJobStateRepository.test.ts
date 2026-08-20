import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { JobStateRepository } from '../../../../src/Domain/Job/JobStateRepository.ts';
import DatabaseUtil from '../../../Helper/DatabaseUtil';

describe('OrmJobStateRepository Integration Test', () => {
    let jobStateRepository: JobStateRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        jobStateRepository = myContainer.get<JobStateRepository>(TYPES.JobStateRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('getLastRunAt returns null for a job that has never run', async () => {
        expect(await jobStateRepository.getLastRunAt('never-run-job')).toBeNull();
    });

    test('recordRun then getLastRunAt round-trips the timestamp', async () => {
        const lastRunAt = new Date('2026-08-20T10:00:00.000Z');

        await jobStateRepository.recordRun({
            jobName: 'round-trip-job',
            lastRunAt,
            status: 'success',
            summary: '{"considered":1}',
        });

        const result = await jobStateRepository.getLastRunAt('round-trip-job');
        expect(result?.toISOString()).toBe(lastRunAt.toISOString());
    });

    test('recordRun upserts — a second run overwrites the first for the same job', async () => {
        await jobStateRepository.recordRun({
            jobName: 'upsert-job',
            lastRunAt: new Date('2026-08-01T00:00:00.000Z'),
            status: 'failed',
            error: 'first attempt failed',
        });

        const secondRunAt = new Date('2026-08-20T00:00:00.000Z');
        await jobStateRepository.recordRun({
            jobName: 'upsert-job',
            lastRunAt: secondRunAt,
            status: 'success',
            summary: '{"considered":2}',
        });

        const result = await jobStateRepository.getLastRunAt('upsert-job');
        expect(result?.toISOString()).toBe(secondRunAt.toISOString());

        // Exactly one row for this job — an upsert, not an insert.
        const rows = await ormClient.jobRun.findMany({ where: { job_name: 'upsert-job' } });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.status).toBe('success');
    });

    test('different jobs get independent state', async () => {
        await jobStateRepository.recordRun({
            jobName: 'job-a',
            lastRunAt: new Date('2026-08-10T00:00:00.000Z'),
            status: 'success',
        });
        await jobStateRepository.recordRun({
            jobName: 'job-b',
            lastRunAt: new Date('2026-08-15T00:00:00.000Z'),
            status: 'success',
        });

        const a = await jobStateRepository.getLastRunAt('job-a');
        const b = await jobStateRepository.getLastRunAt('job-b');

        expect(a?.toISOString()).toBe('2026-08-10T00:00:00.000Z');
        expect(b?.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    });
});
