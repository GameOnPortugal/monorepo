import { TrophyProfileId } from './TrophyProfileId'

export interface TrophyProfileArray {
  id: string
  userId: string | null
  psnProfile: string | null
  isBanned: boolean | null
  hasLeft: boolean | null
  isExcluded: boolean | null
  createdAt: Date
  updatedAt: Date
}

export class TrophyProfile {
  constructor(
    public readonly id: TrophyProfileId,
    public readonly userId: string | null,
    public readonly psnProfile: string | null,
    public readonly isBanned: boolean | null,
    public readonly hasLeft: boolean | null,
    public readonly isExcluded: boolean | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  public static fromArray(array: TrophyProfileArray): TrophyProfile {
    return new TrophyProfile(
      TrophyProfileId.fromString(array.id),
      array.userId,
      array.psnProfile,
      array.isBanned,
      array.hasLeft,
      array.isExcluded,
      array.createdAt,
      array.updatedAt
    )
  }
}