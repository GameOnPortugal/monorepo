import { inject, injectable } from 'inversify'
import { PrismaClient } from '@prisma/client'
import { TYPES } from '../DependencyInjection/types'
import { Ad, type AdArray } from '../../Domain/Marketplace/Ad'
import { AdId } from '../../Domain/Marketplace/AdId'
import type { AdRepository } from '../../Domain/Marketplace/AdRepository'
import RecordNotFound from '../../Domain/RecordNotFound'

@injectable()
export class OrmAdRepository implements AdRepository {
  constructor(
    @inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient
  ) {}

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
        updatedAt: ad.updatedAt
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
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt
      }
    })
  }

  async get(id: AdId): Promise<Ad> {
    const ad = await this.prismaClient.ad.findUnique({
      where: { id: id.toString() }
    })

    if (ad === null) {
      throw new RecordNotFound(`Ad with id ${id.toString()} not found`)
    }

    return Ad.fromArray(ad as AdArray)
  }

  async delete(id: AdId): Promise<void> {
    await this.prismaClient.ad.delete({
      where: { id: id.toString() }
    })
  }

  async findByUserId(userId: string): Promise<Ad[]> {
    const ads = await this.prismaClient.ad.findMany({
      where: { author_id: userId },
      orderBy: { createdAt: 'desc' }
    })

    return ads.map(ad => Ad.fromArray(ad as AdArray))
  }
}
