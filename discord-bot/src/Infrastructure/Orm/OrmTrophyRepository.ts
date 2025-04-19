import {inject, injectable} from 'inversify'
import {PrismaClient} from '@prisma/client'
import {TYPES} from '../DependencyInjection/types'
import {Trophy, type TrophyArray} from '../../Domain/Trophy/Trophy'
import {TrophyId} from '../../Domain/Trophy/TrophyId'
import type {TrophyRepository} from '../../Domain/Trophy/TrophyRepository'
import type {TrophyRankData} from '../../Domain/Trophy/TrophyRankData'
import type {UserPosition} from '../../Domain/Trophy/UserPosition'
import RecordNotFound from '../../Domain/RecordNotFound'

@injectable()
export class OrmTrophyRepository implements TrophyRepository {
  constructor(
    @inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient
  ) {}

  async save(trophy: Trophy): Promise<void> {
    await this.prismaClient.trophies.upsert({
      where: { id: trophy.id.toString() },
      update: {
        trophyProfile: trophy.trophyProfile,
        url: trophy.url,
        points: trophy.points,
        completionDate: trophy.completionDate,
        updatedAt: trophy.updatedAt
      },
      create: {
        id: trophy.id.toString(),
        trophyProfile: trophy.trophyProfile,
        url: trophy.url,
        points: trophy.points,
        completionDate: trophy.completionDate,
        createdAt: trophy.createdAt,
        updatedAt: trophy.updatedAt
      }
    })
  }

  async get(id: TrophyId): Promise<Trophy> {
    const trophy = await this.prismaClient.trophies.findUnique({
      where: { id: id.toString() }
    })

    if (trophy === null) {
      throw new RecordNotFound(`Trophy with id ${id.toString()} not found`)
    }

    return Trophy.fromArray(trophy as TrophyArray)
  }

  async delete(id: TrophyId): Promise<void> {
    await this.prismaClient.trophies.delete({
      where: { id: id.toString() }
    })
  }

  async findByProfile(profileId: string): Promise<Trophy[]> {
    const trophies = await this.prismaClient.trophies.findMany({
      where: { trophyProfile: profileId },
      orderBy: { completionDate: 'desc' }
    })

    return trophies.map(trophy => Trophy.fromArray(trophy as TrophyArray))
  }

  async getTopMonthlyHunters(limit: number, date: Date): Promise<TrophyRankData[]> {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    const result = await this.prismaClient.trophyProfile.findMany({
        where: {
            isExcluded: false,
            trophies: {
                some: {
                    completionDate: {
                        gte: firstDayOfMonth,
                        lte: lastDayOfMonth
                    }
                }
            }
        },
        include: {
            trophies: {
                where: {
                    completionDate: {
                        gte: firstDayOfMonth,
                        lte: lastDayOfMonth
                    }
                }
            },
            _count: {
                select: {
                    trophies: {
                        where: {
                            completionDate: {
                                gte: firstDayOfMonth,
                                lte: lastDayOfMonth
                            }
                        }
                    }
                }
            }
        },
        take: limit
    });

    if (!result.length) {
        return [];
    }

    const mappedResults = result.map(profile => ({
        userId: profile.userId ?? '',
        psnProfile: profile.psnProfile ?? '',
        points: profile.trophies.reduce((sum, trophy) => sum + (trophy.points ?? 0), 0),
        num_trophies: profile._count.trophies
    }));

    return mappedResults.sort((a, b) => b.points - a.points);
}

async getTopSinceCreationHunters(limit: number): Promise<TrophyRankData[]> {
    const result = await this.prismaClient.trophyProfile.findMany({
        where: {
            isExcluded: false,
            trophies: {
                some: {}
            }
        },
        include: {
            trophies: true,
            _count: {
                select: {
                    trophies: true
                }
            }
        },
        take: limit
    });

    if (!result.length) {
        return [];
    }

    const mappedResults = result.map(profile => ({
        userId: profile.userId ?? '',
        psnProfile: profile.psnProfile ?? '',
        points: profile.trophies.reduce((sum, trophy) => sum + (trophy.points ?? 0), 0),
        num_trophies: profile._count.trophies
    }));

    return mappedResults.sort((a, b) => b.points - a.points);
}

async getTopLifetimeHunters(limit: number): Promise<TrophyRankData[]> {
    const result = await this.prismaClient.trophyProfile.findMany({
        where: {
            isExcluded: false,
            trophies: {
                some: {}
            }
        },
        include: {
            trophies: true,
            _count: {
                select: {
                    trophies: true
                }
            }
        },
        take: limit
    });

    if (!result.length) {
        return [];
    }

    const mappedResults = result.map(profile => ({
        userId: profile.userId ?? '',
        psnProfile: profile.psnProfile ?? '',
        points: profile.trophies.reduce((sum, trophy) => sum + (trophy.points ?? 0), 0),
        num_trophies: profile._count.trophies
    }));

    return mappedResults.sort((a, b) => b.points - a.points);
}

async findUserPosition(userId: string): Promise<UserPosition> {
    const userProfile = await this.prismaClient.trophyProfile.findFirst({
        where: {
            userId,
            isExcluded: false
        },
        include: {
            trophies: true
        }
    });

    if (!userProfile) {
        return {
            totalPoints: 0,
            totalTrophies: 0,
            ranks: [
                { name: 'monthly', position: 0, points: 0, trophies: 0 }, // Monthly
                { name: 'creation', position: 0, points: 0, trophies: 0 }, // Creation
                { name: 'lifetime', position: 0, points: 0, trophies: 0 }  // Lifetime
            ]
        };
    }

    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const monthlyTrophies = userProfile.trophies.filter(t => 
        t.completionDate && t.completionDate >= firstDayOfMonth
    );
    const monthlyPoints = monthlyTrophies.reduce((sum, t) => sum + (t.points ?? 0), 0);

    const allMonthlyProfiles = await this.getTopMonthlyHunters(1000, new Date());
    const monthlyRank = monthlyPoints > 0 
        ? allMonthlyProfiles.findIndex(p => p.userId === userId) + 1 
        : 0;

    const totalPoints = userProfile.trophies.reduce((sum, t) => sum + (t.points ?? 0), 0);

    const allCreationProfiles = await this.getTopSinceCreationHunters(1000);
    const creationRank = totalPoints > 0 
        ? allCreationProfiles.findIndex(p => p.userId === userId) + 1 
        : 0;

    return {
        totalPoints,
        totalTrophies: userProfile.trophies.length,
        ranks: [
            {
                name: 'monthly',
                position: monthlyRank,
                points: monthlyPoints,
                trophies: monthlyTrophies.length
            },
            {
                name: 'creation',
                position: creationRank,
                points: totalPoints,
                trophies: userProfile.trophies.length
            },
            {
                name: 'lifetime',
                position: creationRank, // Same as creation rank for now
                points: totalPoints,
                trophies: userProfile.trophies.length
            }
        ]
    };
}

}
