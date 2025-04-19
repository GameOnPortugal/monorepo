import { TrophyId } from './TrophyId'

export interface TrophyArray {
  id: string
  trophyProfile: string | null
  url: string | null
  points: number | null
  completionDate: Date | null
  createdAt: Date
  updatedAt: Date
}

export class Trophy {
  constructor(
    public readonly id: TrophyId,
    public readonly trophyProfile: string | null,
    public readonly url: string | null,
    public readonly points: number | null,
    public readonly completionDate: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  public static fromArray(array: TrophyArray): Trophy {
    return new Trophy(
      TrophyId.fromString(array.id),
      array.trophyProfile,
      array.url,
      array.points,
      array.completionDate,
      array.createdAt,
      array.updatedAt
    )
  }
}