import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

export class DeleteAd implements Command {
    constructor(
        public readonly id: AdId,
        public readonly userId: string,
        /**
         * M5.10 — set by the caller from the *interaction's* live permission
         * bits (`isGuildAdmin()`, `Domain/Bot/AdminCheck.ts`), never derived
         * here. Defaults to `false` rather than being required: `DeleteAd`
         * predates the admin-override concept (M5.2) and most callers —
         * every existing test, and any future owner-only caller — have no
         * reason to think about it. Same shape as `MarkAdSold.isAdmin`
         * (M5.6), which this finally brings `delete` in line with — see
         * `UnauthorizedAdAction`'s doc comment, which already said this was
         * coming.
         */
        public readonly isAdmin: boolean = false,
    ) {}
}
