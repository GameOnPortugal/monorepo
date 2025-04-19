import { AdId } from '../../../../Domain/Marketplace/AdId'
import type Command from "../../../../Domain/Command/Command.ts";

export class CreateAd implements Command {
  constructor(
    public readonly id: AdId,
    public readonly name: string,
    public readonly authorId: string,
    public readonly channelId: string,
    public readonly messageId: string,
    public readonly state: string,
    public readonly price: string,
    public readonly zone: string,
    public readonly dispatch: string,
    public readonly warranty: string,
    public readonly description: string,
    public readonly adType: string
  ) {}
}