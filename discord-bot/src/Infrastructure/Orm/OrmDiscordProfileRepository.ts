import { PrismaClient } from '@prisma/client';
import { inject, injectable } from 'inversify';
import { TYPES } from '../DependencyInjection/types';
import { DiscordProfile, type DiscordProfileArray } from '../../Domain/Profile/DiscordProfile.ts';
import type { DiscordProfileRepository } from '../../Domain/Profile/DiscordProfileRepository.ts';

interface AuthorIdRow {
    authorId: string | null;
}

@injectable()
export default class OrmDiscordProfileRepository implements DiscordProfileRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async save(profile: DiscordProfile): Promise<void> {
        const row = profile.toArray();
        await this.prismaClient.discordProfile.upsert({
            where: { discordId: profile.discordId },
            update: row,
            create: row,
        });
    }

    async find(discordId: string): Promise<DiscordProfile | null> {
        const row = await this.prismaClient.discordProfile.findUnique({ where: { discordId } });
        return row === null ? null : DiscordProfile.fromArray(row as DiscordProfileArray);
    }

    /**
     * Raw SQL rather than two `findMany({ distinct })` calls: `ads` and
     * `screenshots` are separate tables with no relation between them, so
     * de-duplicating across both in Prisma would mean pulling both id lists
     * into memory and merging them by hand. A `UNION` (not `UNION ALL` —
     * the de-duplication is the point) does it in the database, which is
     * also where the 109 distinct authors behind 695 rows actually live.
     */
    async findAuthorIdsNeedingProfile(): Promise<string[]> {
        const rows = await this.prismaClient.$queryRawUnsafe<AuthorIdRow[]>(
            `
              SELECT author_id AS authorId FROM screenshots WHERE author_id IS NOT NULL AND author_id <> ''
              UNION
              SELECT author_id AS authorId FROM ads WHERE author_id IS NOT NULL AND author_id <> ''
            `,
        );

        return rows.map((row) => row.authorId).filter((id): id is string => id !== null);
    }

    /**
     * The same population, narrowed to rows that are missing or stale and
     * ordered stalest-first. `LEFT JOIN ... WHERE syncedAt IS NULL OR
     * syncedAt < ?` puts never-synced authors first (NULL sorts before any
     * date in MariaDB's ascending order), which is what makes the very first
     * bounded run of DiscordProfilesSyncJob spend its whole budget on the
     * 109 authors that have no profile at all.
     */
    async findStaleAuthorIds(staleBefore: Date, limit: number): Promise<string[]> {
        const rows = await this.prismaClient.$queryRawUnsafe<AuthorIdRow[]>(
            `
              SELECT authors.authorId AS authorId
              FROM (
                SELECT author_id AS authorId FROM screenshots WHERE author_id IS NOT NULL AND author_id <> ''
                UNION
                SELECT author_id AS authorId FROM ads WHERE author_id IS NOT NULL AND author_id <> ''
              ) AS authors
              LEFT JOIN discord_profiles p ON p.discordId = authors.authorId
              WHERE p.syncedAt IS NULL OR p.syncedAt < ?
              ORDER BY p.syncedAt IS NOT NULL, p.syncedAt ASC
              LIMIT ?
            `,
            staleBefore,
            limit,
        );

        return rows.map((row) => row.authorId).filter((id): id is string => id !== null);
    }

    async delete(discordId: string): Promise<void> {
        await this.prismaClient.discordProfile.deleteMany({ where: { discordId } });
    }
}
