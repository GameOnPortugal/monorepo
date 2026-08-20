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
            update: {
                userId: trophyProfile.userId,
                psnProfile: trophyProfile.psnProfile,
                isBanned: trophyProfile.isBanned,
                hasLeft: trophyProfile.hasLeft,
                isExcluded: trophyProfile.isExcluded,
                updatedAt: trophyProfile.updatedAt,
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
        const trophyProfiles = await this.prismaClient.trophyProfile.findMany({
            where: { isExcluded: false },
        });

        return trophyProfiles.map((trophyProfile) =>
            TrophyProfile.fromArray(trophyProfile as TrophyProfileArray),
        );
    }
}
