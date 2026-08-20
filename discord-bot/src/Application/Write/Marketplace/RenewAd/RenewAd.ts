import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

/**
 * M6.5 — what the future M4.7 button handler for `mkt:renew:<adId>` will
 * dispatch once it exists (see `AdsLifecycleJob.ts` for the customId scheme
 * and the ownership-recheck warning). `userId` is the id read off the
 * interaction that clicked the button — **not** trusted from the customId —
 * so this handler can verify it against the row's own `authorId` itself
 * rather than relying on the caller having already checked.
 *
 * `channelId` is supplied by the caller (mirrors `CreateAd`'s shape) because
 * only the Infrastructure layer knows the resolved snowflake for
 * `CommunityChannels.MARKETPLACE` — this command stays free of Discord
 * specifics beyond the raw id it's told to persist.
 */
export class RenewAd implements Command {
    constructor(
        public readonly id: AdId,
        public readonly userId: string,
        public readonly channelId: string,
    ) {}
}
