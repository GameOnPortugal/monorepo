import { AdId } from './AdId'

export interface AdArray {
  id: string
  name: string | null
  author_id: string | null
  channel_id: string | null
  message_id: string | null
  state: string
  price: string | null
  zone: string | null
  dispatch: string | null
  warranty: string | null
  description: string | null
  adType: string | null
  createdAt: Date
  updatedAt: Date
}

export class Ad {
  constructor(
    public readonly id: AdId,
    public readonly name: string | null,
    public readonly authorId: string | null,
    public readonly channelId: string | null,
    public readonly messageId: string | null,
    public readonly state: string,
    public readonly price: string | null,
    public readonly zone: string | null,
    public readonly dispatch: string | null,
    public readonly warranty: string | null,
    public readonly description: string | null,
    public readonly adType: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  public static fromArray(array: AdArray): Ad {
    return new Ad(
      AdId.fromString(array.id),
      array.name,
      array.author_id,
      array.channel_id,
      array.message_id,
      array.state,
      array.price,
      array.zone,
      array.dispatch,
      array.warranty,
      array.description,
      array.adType,
      array.createdAt,
      array.updatedAt
    )
  }
}