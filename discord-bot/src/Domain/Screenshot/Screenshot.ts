import { ScreenshotId } from './ScreenshotId'

export interface ScreenshotArray {
  id: string
  name: string | null
  author_id: string | null
  channel_id: string | null
  message_id: string | null
  plataform: string | null
  image: string | null
  image_md5: string | null
  createdAt: Date
  updatedAt: Date
}

export class Screenshot {
  constructor (
    public readonly id: ScreenshotId,
    public readonly name: string | null,
    public readonly authorId: string | null,
    public readonly channelId: string | null,
    public readonly messageId: string | null,
    public readonly platform: string | null,
    public readonly image: string | null,
    public readonly imageMd5: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {
  }

  update (
    name?: string | null,
    authorId?: string | null,
    channelId?: string | null,
    messageId?: string | null,
    platform?: string | null,
    image?: string | null,
    imageMd5?: string | null
  ): Screenshot {
    return new Screenshot(
      this.id,
      name ?? this.name,
      authorId ?? this.authorId,
      channelId ?? this.channelId,
      messageId ?? this.messageId,
      platform ?? this.platform,
      image ?? this.image,
      imageMd5 ?? this.imageMd5,
      this.createdAt,
      new Date()
    )
  }

  static fromArray (screenshot: ScreenshotArray): Screenshot {
    return new Screenshot(
      ScreenshotId.fromString(screenshot.id),
      screenshot.name,
      screenshot.author_id,
      screenshot.channel_id,
      screenshot.message_id,
      screenshot.plataform,
      screenshot.image,
      screenshot.image_md5,
      screenshot.createdAt,
      screenshot.updatedAt
    )
  }

  toArray (): ScreenshotArray {
    return {
      id: this.id.toString(),
      name: this.name,
      author_id: this.authorId,
      channel_id: this.channelId,
      message_id: this.messageId,
      plataform: this.platform,
      image: this.image,
      image_md5: this.imageMd5,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}