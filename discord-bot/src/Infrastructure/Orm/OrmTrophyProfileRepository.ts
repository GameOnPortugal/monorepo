import { inject, injectable } from 'inversify';
import { PrismaClient } from '@prisma/client';
import { TYPES } from '../DependencyInjection/types';
import { TrophyProfile, type TrophyProfileArray } from '../../Domain/Trophy/TrophyProfile';
import { TrophyProfileId } from '../../Domain/Trophy/TrophyProfileId';
import type { TrophyProfileRepository } from '../../Domain/Trophy/TrophyProfileRepository';
import RecordNotFound from '../../Domain/RecordNotFound';

@injectable()
export class OrmTrophyProfileRepository implements TrophyProfileRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async save(trophyProfile: TrophyProfile): Promise<void> {
        await this.prismaClient.trophyProfile.upsert({
            where: { id: trophyProfile.id.toString() },
            // `updatedAt` is deliberately absent here: Prisma's `@updatedAt`
            // only auto-stamps a field the payload does not mention, so
            // passing the entity's own (just-loaded, therefore stale) value
            // back would pin the column forever — which is exactly how it
            // came to read 2022 on profiles that had been written since.
            update: {
                userId: trophyProfile.userId,
                psnProfile: trophyProfile.psnProfile,
                isBanned: trophyProfile.isBanned,
                hasLeft: trophyProfile.hasLeft,
                isExcluded: trophyProfile.isExcluded,
                lastSyncedAt: trophyProfile.lastSyncedAt,
            },
            create: {
                id: trophyProfile.id.toString(),
                userId: trophyProfile.userId,
                psnProfile: trophyProfile.psnProfile,
                isBanned: trophyProfile.isBanned,
                hasLeft: trophyProfile.hasLeft,
                isExcluded: trophyProfile.isExcluded,
                createdAt: trophyProfile.createdAt,
                updatedAt: trophyProfile.updatedAt,
                lastSyncedAt: trophyProfile.lastSyncedAt,
            },
        });
    }

    async get(id: TrophyProfileId): Promise<TrophyProfile> {
        const trophyProfile = await this.prismaClient.trophyProfile.findUnique({
            where: { id: id.toString() },
        });

        if (trophyProfile === null) {
            throw new RecordNotFound(`TrophyProfile with id ${id.toString()} not found`);
        }

        return TrophyProfile.fromArray(trophyProfile as TrophyProfileArray);
    }

    async delete(id: TrophyProfileId): Promise<void> {
        await this.prismaClient.trophyProfile.delete({
            where: { id: id.toString() },
        });
    }

    async markSynced(id: TrophyProfileId, syncedAt: Date): Promise<void> {
        await this.prismaClient.trophyProfile.update({
            where: { id: id.toString() },
            data: { lastSyncedAt: syncedAt },
        });
    }

    async findByUserId(userId: string): Promise<TrophyProfile | null> {
        const trophyProfile = await this.prismaClient.trophyProfile.findFirst({
            where: { userId },
        });

        if (trophyProfile === null) {
            return null;
        }

        return TrophyProfile.fromArray(trophyProfile as TrophyProfileArray);
    }

    async findByPsnProfile(psnProfile: string): Promise<TrophyProfile | null> {
        const trophyProfile = await this.prismaClient.trophyProfile.findFirst({
            where: { psnProfile },
        });

        if (trophyProfile === null) {
            return null;
        }

        return TrophyProfile.fromArray(trophyProfile as TrophyProfileArray);
    }

    async findAllNonExcluded(): Promise<TrophyProfile[]> {
        // `isExcluded: false` (not `{ not: true }`) deliberately matches the
        // `WHERE tp.isExcluded = false` used elsewhere in this codebase
        // (OrmTrophyRepository's ranking queries) — a NULL isExcluded row is
        // treated as excluded by both, so the two never disagree about which
        // profiles are "live".
        //
        // `orderBy: lastSyncedAt asc` is what makes that column actually
        // steer the crawl rather than merely record it: MySQL sorts NULL
        // first in ascending order, so never-synced profiles lead, then the
        // longest-stale ones — exactly the set `TrophiesSyncJob.run()`'s
        // work-limit budget should spend on first when a pass can't cover
        // every profile in one run.
        const trophyProfiles = await this.prismaClient.trophyProfile.findMany({
            where: { isExcluded: false },
            orderBy: { lastSyncedAt: 'asc' },
        });

        return trophyProfiles.map((trophyProfile) =>
            TrophyProfile.fromArray(trophyProfile as TrophyProfileArray),
        );
    }
}
