import type { Trophy } from './Trophy'
import type { TrophyId } from './TrophyId'
import type { TrophyRankData } from './TrophyRankData'
import type { TrophyProfileId } from './TrophyProfileId'
import type { UserPosition } from './UserPosition'

export interface TrophyRepository {
  save(trophy: Trophy): Promise<void>

  /**
   * @throws RecordNotFound
   */
  get(id: TrophyId): Promise<Trophy>

  delete(id: TrophyId): Promise<void>

  findByProfile(profileId: string): Promise<Trophy[]>

  getTopMonthlyHunters(limit: number, monthFilter: Date): Promise<TrophyRankData[]>

  getTopSinceCreationHunters(limit: number): Promise<TrophyRankData[]>

  getTopLifetimeHunters(limit: number): Promise<TrophyRankData[]>

  findUserPosition(userId: string): Promise<UserPosition>
}