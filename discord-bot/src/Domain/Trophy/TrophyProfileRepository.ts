import type { TrophyProfile } from './TrophyProfile'
import type { TrophyProfileId } from './TrophyProfileId'

export interface TrophyProfileRepository {
  save: (trophyProfile: TrophyProfile) => Promise<void>

  /**
   * @throws RecordNotFound
   */
  get(id: TrophyProfileId): Promise<TrophyProfile>

  delete(id: TrophyProfileId): Promise<void>

  findByUserId(userId: string): Promise<TrophyProfile | null>

  findByPsnProfile(psnProfile: string): Promise<TrophyProfile | null>
}