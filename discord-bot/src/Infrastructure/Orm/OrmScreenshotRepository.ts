import { PrismaClient } from '@prisma/client'
import { inject, injectable } from 'inversify'
import { TYPES } from '../DependencyInjection/types'
import RecordNotFound from '../../Domain/RecordNotFound'
import { Screenshot, type ScreenshotArray } from '../../Domain/Screenshot/Screenshot'
import { ScreenshotId } from '../../Domain/Screenshot/ScreenshotId'
import type {ScreenshotRepository} from "../../Domain/Screenshot/ScreenshotRepository.ts";
import dayjs from 'dayjs'

@injectable()
export default class OrmScreenshotRepository implements ScreenshotRepository {
  constructor (
    @inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient
  ) {
  }

  async save (screenshot: Screenshot): Promise<void> {
    await this.prismaClient.screenshot.upsert({
      where: { id: screenshot.id.toString() },
      update: screenshot.toArray(),
      create: screenshot.toArray()
    })
  }

  async get (id: ScreenshotId): Promise<Screenshot> {
    const object = await this.prismaClient.screenshot.findUnique({
      where: { id: id.toString() }
    })

    if (object === null) {
      throw new RecordNotFound(`Screenshot with "${id.toString()}" id not found`)
    }

    return Screenshot.fromArray(object as ScreenshotArray)
  }

  async delete (id: ScreenshotId): Promise<void> {
    await this.prismaClient.screenshot.delete({
      where: { id: id.toString() }
    })
  }

  async findByMd5 (md5: string): Promise<Screenshot | null> {
    const object = await this.prismaClient.screenshot.findFirst({
      where: { image_md5: md5 }
    })

    return object !== null ? Screenshot.fromArray(object as ScreenshotArray) : null;
  }

  async findBy (userId: string | null): Promise<Screenshot[]> {
    // Build the where clause based on whether userId is provided
    const where = userId !== null ? { author_id: userId } : {};

    const objects = await this.prismaClient.screenshot.findMany({
      where,
      orderBy: { createdAt: 'desc' } // Most recent first
    })

    // Convert each database object to a Screenshot domain entity
    return objects.map(object => Screenshot.fromArray(object as ScreenshotArray));
  }

  async findByWeek(week: Date): Promise<Screenshot[]> {
    const startOfWeek = dayjs(week).startOf('week').toDate()
    const endOfWeek = dayjs(week).endOf('week').toDate()

    const screenshots = await this.prismaClient.screenshot.findMany({
      where: {
        createdAt: {
          gte: startOfWeek,
          lte: endOfWeek
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return screenshots.map(screenshot => Screenshot.fromArray(screenshot as ScreenshotArray))
  }
}
