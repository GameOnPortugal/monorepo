import { AdId } from '../../../../Domain/Marketplace/AdId'
import type Command from "../../../../Domain/Command/Command.ts";

export class DeleteAd implements Command {
  constructor(
    public readonly id: AdId,
    public readonly userId: string
  ) {}
}
