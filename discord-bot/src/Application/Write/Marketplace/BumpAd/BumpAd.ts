import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

/**
 * M5.6 — backs both the `🔄 Renovar` button (M5.5) and `/marketplace bump`.
 * Owner-only, unlike `MarkAdSold` — there is no admin-bump concept in plan
 * 01, and bumping someone else's listing on their behalf is not a
 * moderation action the way marking it sold is.
 *
 * `channelId` mirrors `CreateAd`'s shape: the *resolved* Discord channel id
 * (`DiscordChannels.MARKETPLACE`) is Infrastructure's to know, not this
 * command's — `BumpAdHandler` only needs a `CommunityChannels` member (a
 * Domain-level enum) to actually post through `GuildClient.sendRichMessage`,
 * and a raw id to persist onto the row afterwards.
 */
export class BumpAd implements Command {
    constructor(
        public readonly id: AdId,
        public readonly userId: string,
        public readonly channelId: string,
    ) {}
}
