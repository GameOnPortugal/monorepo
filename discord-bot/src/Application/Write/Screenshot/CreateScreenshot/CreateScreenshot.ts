import type Command from "../../../../Domain/Command/Command.ts";
import type {ScreenshotId} from "../../../../Domain/Screenshot/ScreenshotId.ts";

export class CreateScreenshot implements Command {
  constructor(
      public readonly id: ScreenshotId,
    public readonly name: string,
    public readonly authorId: string | null,
    public readonly channelId: string | null,
    public readonly messageId: string | null,
    public readonly platform: string,
    public readonly image: string,
  ) {}
}