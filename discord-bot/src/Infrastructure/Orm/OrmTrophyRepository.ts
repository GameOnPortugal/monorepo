import { inject, injectable } from 'inversify';
import { Prisma, PrismaClient } from '@prisma/client';
import { TYPES } from '../DependencyInjection/types';
import { Trophy, type TrophyArray } from '../../Domain/Trophy/Trophy';
import { TrophyId } from '../../Domain/Trophy/TrophyId';
import type { TrophyRepository } from '../../Domain/Trophy/TrophyRepository';
import type { TrophyRankData } from '../../Domain/Trophy/TrophyRankData';
import type { UserPosition } from '../../Domain/Trophy/UserPosition';
import RecordNotFound from '../../Domain/RecordNotFound';

interface DateRange {
    start: Date;
    end: Date;
}

interface RankedHunterRow {
    userId: string | null;
    psnProfile: string | null;
    points: number;
    num_trophies: number;
}

interface UserRankRow {
    position: number;
    points: number;
    num_trophies: number;
}

/**
 * Points and trophy counts are aggregated and ordered in SQL (not fetched and
 * sorted in application code) so that `LIMIT` truncates the ranking *after*
 * it has been computed, not before. Ties are broken deterministically by
 * trophy count, then by profile name, so repeated calls do not shuffle.
 */
@injectable()
export class OrmTrophyRepository implements TrophyRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async save(trophy: Trophy): Promise<void> {
        await this.prismaClient.trophies.upsert({
            where: { id: trophy.id.toString() },
            update: {
                trophyProfile: trophy.trophyProfile,
                url: trophy.url,
                points: trophy.points,
                completionDate: trophy.completionDate,
                updatedAt: trophy.updatedAt,
            },
            create: {
                id: trophy.id.toString(),
                trophyProfile: trophy.trophyProfile,
                url: trophy.url,
                points: trophy.points,
                completionDate: trophy.completionDate,
                createdAt: trophy.createdAt,
                updatedAt: trophy.updatedAt,
            },
        });
    }

    async get(id: TrophyId): Promise<Trophy> {
        const trophy = await this.prismaClient.trophies.findUnique({
            where: { id: id.toString() },
        });

        if (trophy === null) {
            throw new RecordNotFound(`Trophy with id ${id.toString()} not found`);
        }

        return Trophy.fromArray(trophy as TrophyArray);
    }

    async delete(id: TrophyId): Promise<void> {
        await this.prismaClient.trophies.delete({
            where: { id: id.toString() },
        });
    }

    async findByProfile(profileId: string): Promise<Trophy[]> {
        const trophies = await this.prismaClient.trophies.findMany({
            where: { trophyProfile: profileId },
            orderBy: { completionDate: 'desc' },
        });

        return trophies.map((trophy) => Trophy.fromArray(trophy as TrophyArray));
    }

    async getTopMonthlyHunters(limit: number, date: Date): Promise<TrophyRankData[]> {
        const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

        return this.queryRankedHunters(limit, { start: firstDayOfMonth, end: lastDayOfMonth });
    }

    async getTopSinceCreationHunters(limit: number): Promise<TrophyRankData[]> {
        return this.queryRankedHunters(limit);
    }

    async getTopLifetimeHunters(limit: number): Promise<TrophyRankData[]> {
        // Same query as `getTopSinceCreationHunters`: there is no "since
        // creation" cutoff distinct from "lifetime" in the data we have, both
        // are simply "all trophies, no date filter".
        return this.queryRankedHunters(limit);
    }

    async findUserPosition(userId: string): Promise<UserPosition> {
        const zeroPosition: UserPosition = {
            totalPoints: 0,
            totalTrophies: 0,
            ranks: [
                { name: 'monthly', position: 0, points: 0, trophies: 0 },
                { name: 'creation', position: 0, points: 0, trophies: 0 },
                { name: 'lifetime', position: 0, points: 0, trophies: 0 },
            ],
        };

        // No date filter: identical to `getTopSinceCreationHunters` /
        // `getTopLifetimeHunters`. `null` means the profile doesn't exist,
        // is excluded, or has zero trophies — all of which map to the
        // zero-position response, matching the previous behaviour.
        const creation = await this.queryUserRank(userId);

        if (creation === null) {
            return zeroPosition;
        }

        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        const lastDayOfMonth = new Date(
            firstDayOfMonth.getFullYear(),
            firstDayOfMonth.getMonth() + 1,
            0,
            23,
            59,
            59,
        );

        const monthly = await this.queryUserRank(userId, {
            start: firstDayOfMonth,
            end: lastDayOfMonth,
        });

        return {
            totalPoints: creation.points,
            totalTrophies: creation.trophies,
            ranks: [
                {
                    name: 'monthly',
                    position: monthly?.position ?? 0,
                    points: monthly?.points ?? 0,
                    trophies: monthly?.trophies ?? 0,
                },
                {
                    name: 'creation',
                    position: creation.position,
                    points: creation.points,
                    trophies: creation.trophies,
                },
                {
                    name: 'lifetime',
                    // Same underlying ranking as `creation` — see comment on
                    // `getTopLifetimeHunters`.
                    position: creation.position,
                    points: creation.points,
                    trophies: creation.trophies,
                },
            ],
        };
    }

    /**
     * Builds the `trophies` join condition, optionally restricted to a date
     * range. Values are always bound parameters — never string-interpolated.
     */
    private buildDateCondition(dateRange?: DateRange): Prisma.Sql {
        if (!dateRange) {
            return Prisma.empty;
        }

        return Prisma.sql`AND t.completionDate >= ${dateRange.start} AND t.completionDate <= ${dateRange.end}`;
    }

    /**
     * Sums points and counts trophies per profile in SQL, orders by points
     * (then trophy count, then profile name for a deterministic tiebreak),
     * and only then applies `LIMIT` — so "top N" is genuinely the top N.
     */
    private async queryRankedHunters(
        limit: number,
        dateRange?: DateRange,
    ): Promise<TrophyRankData[]> {
        const safeLimit = Math.max(0, Math.trunc(limit));
        const dateCondition = this.buildDateCondition(dateRange);

        const rows = await this.prismaClient.$queryRaw<RankedHunterRow[]>(Prisma.sql`
            SELECT
                tp.userId AS userId,
                tp.psnProfile AS psnProfile,
                CAST(COALESCE(SUM(t.points), 0) AS SIGNED) AS points,
                CAST(COUNT(t.id) AS SIGNED) AS num_trophies
            FROM trophyprofiles tp
            INNER JOIN trophies t ON t.trophyProfile = tp.id ${dateCondition}
            WHERE tp.isExcluded = false
            GROUP BY tp.id, tp.userId, tp.psnProfile
            ORDER BY points DESC, num_trophies DESC, tp.psnProfile ASC
            LIMIT ${safeLimit}
        `);

        return rows.map((row) => ({
            userId: row.userId ?? '',
            psnProfile: row.psnProfile ?? '',
            points: Number(row.points ?? 0),
            num_trophies: Number(row.num_trophies ?? 0),
        }));
    }

    /**
     * Computes one user's rank, points and trophy count directly in SQL
     * using a window function, instead of pulling up to 1000 profiles
     * (each with every trophy row) into memory and index-searching them.
     */
    private async queryUserRank(
        userId: string,
        dateRange?: DateRange,
    ): Promise<{ position: number; points: number; trophies: number } | null> {
        const dateCondition = this.buildDateCondition(dateRange);

        const rows = await this.prismaClient.$queryRaw<UserRankRow[]>(Prisma.sql`
            SELECT position, points, num_trophies
            FROM (
                SELECT
                    tp.userId AS userId,
                    CAST(COALESCE(SUM(t.points), 0) AS SIGNED) AS points,
                    CAST(COUNT(t.id) AS SIGNED) AS num_trophies,
                    RANK() OVER (
                        ORDER BY
                            CAST(COALESCE(SUM(t.points), 0) AS SIGNED) DESC,
                            CAST(COUNT(t.id) AS SIGNED) DESC,
                            tp.psnProfile ASC
                    ) AS position
                FROM trophyprofiles tp
                INNER JOIN trophies t ON t.trophyProfile = tp.id ${dateCondition}
                WHERE tp.isExcluded = false
                GROUP BY tp.id, tp.userId, tp.psnProfile
            ) ranked
            WHERE userId = ${userId}
            LIMIT 1
        `);

        // noUncheckedIndexedAccess: `rows[0]` is `UserRankRow | undefined`,
        // guard rather than assume the user made the ranked set.
        const row = rows[0];
        if (row === undefined) {
            return null;
        }

        return {
            position: Number(row.position),
            points: Number(row.points),
            trophies: Number(row.num_trophies),
        };
    }
}
