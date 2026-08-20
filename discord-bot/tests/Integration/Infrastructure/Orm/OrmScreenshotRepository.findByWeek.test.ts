import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createScreenshot } from '../../../Helper/StaticFixtures';
import type { ScreenshotRepository } from '../../../../src/Domain/Screenshot/ScreenshotRepository.ts';
import { COMMUNITY_TIMEZONE } from '../../../../src/Domain/Screenshot/ScreenshotWeekWindow.ts';

dayjs.extend(utc);
dayjs.extend(timezone);

const lisbon = (wallClock: string): Date => dayjs.tz(wallClock, COMMUNITY_TIMEZONE).toDate();

/**
 * M6.4: pins `findByWeek` to the old bot's Monday->Sunday window (see
 * ScreenshotWeekWindow.test.ts for the pure-logic version of these edges).
 * This suite is DB-backed to prove the Prisma `gte`/`lte` query actually
 * behaves as expected at the boundary, not just the in-memory calculation.
 */
describe('OrmScreenshotRepository.findByWeek', () => {
    let repository: ScreenshotRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        repository = myContainer.get<ScreenshotRepository>(TYPES.ScreenshotRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('includes a screenshot posted at the Sunday-23:59:59.999 edge', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            lisbon('2026-01-11 23:59:59.999'), // last instant of the week
        );

        const result = await repository.findByWeek(new Date('2026-01-15T15:00:00Z')); // Thursday, same week

        expect(result.map((s) => s.id.toString())).toContain(screenshot.id.toString());
    });

    test('excludes a screenshot posted one millisecond later, at Monday-00:00:00.000 of the next week', async () => {
        await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            lisbon('2026-01-12 00:00:00.000'), // first instant of the following week
        );

        const result = await repository.findByWeek(new Date('2026-01-15T15:00:00Z')); // still resolves last week

        expect(result).toHaveLength(0);
    });

    test('includes a screenshot posted at the Monday-00:00:00.000 edge of the target week', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            lisbon('2026-01-05 00:00:00.000'), // first instant of the week
        );

        const result = await repository.findByWeek(new Date('2026-01-15T15:00:00Z'));

        expect(result.map((s) => s.id.toString())).toContain(screenshot.id.toString());
    });

    test('excludes a screenshot posted one millisecond before the window (previous Sunday)', async () => {
        await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            lisbon('2026-01-04 23:59:59.999'), // last instant of the previous week
        );

        const result = await repository.findByWeek(new Date('2026-01-15T15:00:00Z'));

        expect(result).toHaveLength(0);
    });

    test('a mid-week reference date returns the most recently completed week, not the in-progress one', async () => {
        // Posted "today" relative to a Thursday reference — i.e. in the
        // still-in-progress week, which findByWeek must NOT return.
        await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            lisbon('2026-01-15 12:00:00.000'), // that same Thursday
        );

        const result = await repository.findByWeek(new Date('2026-01-15T15:00:00Z'));

        expect(result).toHaveLength(0);
    });

    test('returns an empty array for a week with no screenshots', async () => {
        const result = await repository.findByWeek(new Date('2026-01-15T15:00:00Z'));

        expect(result).toEqual([]);
    });
});
