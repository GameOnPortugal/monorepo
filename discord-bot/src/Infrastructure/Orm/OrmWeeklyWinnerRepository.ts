import { PrismaClient } from '@prisma/client';
import { inject, injectable } from 'inversify';
import { TYPES } from '../DependencyInjection/types';
import { WeeklyWinner, type WeeklyWinnerArray } from '../../Domain/Screenshot/WeeklyWinner.ts';
import type { WeeklyWinnerRepository } from '../../Domain/Screenshot/WeeklyWinnerRepository.ts';

@injectable()
export default class OrmWeeklyWinnerRepository implements WeeklyWinnerRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async save(winner: WeeklyWinner): Promise<void> {
        const row = winner.toArray();
        // Upserting on `weekStart` (not `id`) is deliberate: a re-run of the
        // backfill generates a fresh uuid for the same week, and keying on
        // that would insert a duplicate. `id` is therefore only set on the
        // create side.
        const { id, ...withoutId } = row;
        await this.prismaClient.screenshotWinner.upsert({
            where: { weekStart: winner.weekStart },
            update: withoutId,
            create: row,
        });
    }

    async findByWeekStart(weekStart: Date): Promise<WeeklyWinner | null> {
        const row = await this.prismaClient.screenshotWinner.findUnique({ where: { weekStart } });
        return row === null ? null : WeeklyWinner.fromArray(row as WeeklyWinnerArray);
    }

    async findAll(): Promise<WeeklyWinner[]> {
        const rows = await this.prismaClient.screenshotWinner.findMany({
            orderBy: { weekStart: 'desc' },
        });
        return rows.map((row) => WeeklyWinner.fromArray(row as WeeklyWinnerArray));
    }
}
