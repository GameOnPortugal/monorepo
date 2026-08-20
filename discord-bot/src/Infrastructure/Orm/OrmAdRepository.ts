import { inject, injectable } from 'inversify';
import { PrismaClient } from '@prisma/client';
import { TYPES } from '../DependencyInjection/types';
import { Ad, serializeImages, type AdArray } from '../../Domain/Marketplace/Ad';
import { AdId } from '../../Domain/Marketplace/AdId';
import type { AdRepository } from '../../Domain/Marketplace/AdRepository';
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

    async findByUserId(userId: string): Promise<Ad[]> {
        const ads = await this.prismaClient.ad.findMany({
            where: { author_id: userId, deleted_at: null },
            orderBy: { createdAt: 'desc' },
        });

        return ads.map((ad) => Ad.fromArray(ad as AdArray));
    }
}
