import type { Ad } from './Ad'
import type { AdId } from './AdId'

export interface AdRepository {
  save(ad: Ad): Promise<void>

  /**
   * @throws RecordNotFound
   */
  get(id: AdId): Promise<Ad>

  delete(id: AdId): Promise<void>

  findByUserId(userId: string): Promise<Ad[]>
}
