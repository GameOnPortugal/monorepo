import type Command from "../../../../Domain/Command/Command.ts";
import { TrophyProfileId } from "../../../../Domain/Trophy/TrophyProfileId.ts";

export class CreateProfile implements Command {
  constructor(
    public readonly id: TrophyProfileId,
    public readonly userId: string,
    public readonly psnProfile: string
  ) {}
}