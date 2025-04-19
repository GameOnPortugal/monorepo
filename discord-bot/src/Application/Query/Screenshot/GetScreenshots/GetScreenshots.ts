import type Command from "../../../../Domain/Command/Command.ts";

export class GetScreenshots implements Command {
  constructor(
    public readonly userId: string | null = null
  ) {}
}