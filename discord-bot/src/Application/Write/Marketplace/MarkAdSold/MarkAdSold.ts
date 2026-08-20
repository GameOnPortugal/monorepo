import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

/**
 * M5.6 — backs both the `✅ Marcar vendido` button (M5.5) and
 * `/marketplace sold`, which is the point: one command/handler pair, not
 * two implementations of the same rule.
 *
 * `isAdmin` is supplied by the caller, not recomputed here: only
 * Infrastructure has the real interaction to call `isGuildAdmin()`
 * (`Domain/Bot/AdminCheck.ts`) against, and this command stays framework-free
 * like `CreateAd`/`DeleteAd`. It is still the caller's job to have derived
 * this from the interaction's own permission bits — never from anything the
 * member typed or clicked — so `MarkAdSoldHandler` re-deriving *authorship*
 * itself (comparing `userId` against the row's own `authorId`) is what
 * actually keeps this safe, exactly as `CustomId.ts` warns.
 */
export class MarkAdSold implements Command {
    constructor(
        public readonly id: AdId,
        public readonly userId: string,
        public readonly isAdmin: boolean,
    ) {}
}
