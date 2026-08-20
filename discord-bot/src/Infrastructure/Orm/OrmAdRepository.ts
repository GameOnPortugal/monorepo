import { inject, injectable } from 'inversify';
import { Prisma, PrismaClient } from '@prisma/client';
import { TYPES } from '../DependencyInjection/types';
import { Ad, serializeImages, type AdArray } from '../../Domain/Marketplace/Ad';
import { AdId } from '../../Domain/Marketplace/AdId';
import { AdStatus } from '../../Domain/Marketplace/AdStatus';
import type { AdPageOptions, AdRepository } from '../../Domain/Marketplace/AdRepository';
import type { AdSearchCriteria } from '../../Domain/Marketplace/AdSearchCriteria';
import RecordNotFound from '../../Domain/RecordNotFound';

@injectable()
export class OrmAdRepository implements AdRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async save(ad: Ad): Promise<void> {
        await this.prismaClient.ad.upsert({
            where: { id: ad.id.toString() },
            update: {
                name: ad.name,
                author_id: ad.authorId,
                channel_id: ad.channelId,
                message_id: ad.messageId,
                state: ad.state,
                price: ad.price,
                zone: ad.zone,
                dispatch: ad.dispatch,
                warranty: ad.warranty,
                description: ad.description,
                adType: ad.adType,
                status: ad.status.toString(),
                price_cents: ad.priceCents,
                images: serializeImages(ad.images),
                bumped_at: ad.bumpedAt,
                expires_at: ad.expiresAt,
                sold_at: ad.soldAt,
                deleted_at: ad.deletedAt,
                updatedAt: ad.updatedAt,
            },
            create: {
                id: ad.id.toString(),
                name: ad.name,
                author_id: ad.authorId,
                channel_id: ad.channelId,
                message_id: ad.messageId,
                state: ad.state,
                price: ad.price,
                zone: ad.zone,
                dispatch: ad.dispatch,
                warranty: ad.warranty,
                description: ad.description,
                adType: ad.adType,
                status: ad.status.toString(),
                price_cents: ad.priceCents,
                images: serializeImages(ad.images),
                bumped_at: ad.bumpedAt,
                expires_at: ad.expiresAt,
                sold_at: ad.soldAt,
                deleted_at: ad.deletedAt,
                createdAt: ad.createdAt,
                updatedAt: ad.updatedAt,
            },
        });
    }

    async get(id: AdId): Promise<Ad> {
        // Excludes soft-deleted rows (cross-cutting rule 2 / M5.2): a
        // deleted ad is not "found" for any caller of this read path —
        // `DeleteAdHandler` re-fetching it (double delete) gets the same
        // RecordNotFound it would have gotten from a hard delete.
        const ad = await this.prismaClient.ad.findFirst({
            where: { id: id.toString(), deleted_at: null },
        });

        if (ad === null) {
            throw new RecordNotFound(`Ad with id ${id.toString()} not found`);
        }

        return Ad.fromArray(ad as AdArray);
    }

    async delete(id: AdId): Promise<void> {
        // Soft-delete (cross-cutting rule 2 / M5.2): the old bot hard-deleted
        // on expiry, which is why none of its data could ever be
        // reconstructed. `deleted_at` was added by M5.3 precisely so this
        // could stop doing that.
        await this.prismaClient.ad.update({
            where: { id: id.toString() },
            data: {
                status: 'deleted',
                deleted_at: new Date(),
            },
        });
    }

    async findByUserId(userId: string, options?: AdPageOptions): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: { author_id: userId, deleted_at: null },
            orderBy: { createdAt: 'desc' },
            ...(options ? { take: options.limit, skip: options.offset } : {}),
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }

    async countByUserId(userId: string): Promise<number> {
        return this.prismaClient.ad.count({ where: { author_id: userId, deleted_at: null } });
    }

    async countActiveByUserId(userId: string): Promise<number> {
        return this.prismaClient.ad.count({
            where: {
                author_id: userId,
                deleted_at: null,
                status: AdStatus.active().toString(),
            },
        });
    }

    /**
     * Shared by `search()`/`countSearch()` so the two can never drift into
     * matching different rows — a count for one query and a fetch for
     * another would silently mis-render `AdPage.totalPages`.
     */
    private searchWhere(criteria: AdSearchCriteria): Prisma.AdWhereInput {
        const where: Prisma.AdWhereInput = {
            status: AdStatus.active().toString(),
            deleted_at: null,
        };

        if (criteria.adType) {
            where.adType = criteria.adType;
        }
        if (criteria.condition) {
            where.state = criteria.condition;
        }
        if (criteria.zone) {
            where.zone = { contains: criteria.zone };
        }
        if (criteria.maxPriceCents !== undefined) {
            // Only ads with a parsed price can satisfy a max-price filter —
            // NULL means "could not parse" (AdPrice.ts), never "free", so it
            // is excluded rather than treated as matching everything.
            where.price_cents = { lte: criteria.maxPriceCents };
        }
        if (criteria.keyword) {
            where.OR = [
                { name: { contains: criteria.keyword } },
                { description: { contains: criteria.keyword } },
            ];
        }

        return where;
    }

    async search(criteria: AdSearchCriteria, options: AdPageOptions): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: this.searchWhere(criteria),
            // Most-recently-bumped first (MySQL/MariaDB sort NULL as the
            // smallest value, so never-bumped rows naturally fall after
            // bumped ones in DESC order), newest-created as the tiebreak.
            orderBy: [{ bumped_at: 'desc' }, { createdAt: 'desc' }],
            take: options.limit,
            skip: options.offset,
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }

    async countSearch(criteria: AdSearchCriteria): Promise<number> {
        return this.prismaClient.ad.count({ where: this.searchWhere(criteria) });
    }

    async findOrphanedActive(limit: number): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: {
                status: AdStatus.active().toString(),
                deleted_at: null,
                OR: [{ message_id: null }, { message_id: '' }],
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }

    async findIdleActive(idleBefore: Date, limit: number): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: {
                status: AdStatus.active().toString(),
                deleted_at: null,
                NOT: { OR: [{ message_id: null }, { message_id: '' }] },
                // Idle since the last bump, or since creation if it has
                // never been bumped — matches `AdRepository.findIdleActive`'s
                // doc comment.
                OR: [
                    { bumped_at: null, createdAt: { lte: idleBefore } },
                    { bumped_at: { lte: idleBefore } },
                ],
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }

    async findAwaitingResponse(now: Date, limit: number): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: {
                status: AdStatus.pendingRenewal().toString(),
                deleted_at: null,
                expires_at: { lte: now },
            },
            orderBy: { expires_at: 'asc' },
            take: limit,
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }

    async findAllActive(limit: number): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: {
                status: AdStatus.active().toString(),
                deleted_at: null,
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }
}
