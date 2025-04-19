import type Command from "../../../../Domain/Command/Command.ts";
import type { ScreenshotId } from "../../../../Domain/Screenshot/ScreenshotId.ts";

export class DeleteScreenshot implements Command {
  constructor(
    public readonly id: ScreenshotId,
    public readonly userId: string,
  ) {}
}