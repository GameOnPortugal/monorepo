import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

/**
 * M5.6 — backs both the `mkt:edit-submit` modal submission (from
 * `/marketplace edit`, which opens the modal) and re-renders the posted
 * listing in place. Owner-only, like `BumpAd` — editing on someone else's
 * behalf is not a modelled admin action here.
 */
export class EditAd implements Command {
    constructor(
        public readonly id: AdId,
        public readonly userId: string,
        public readonly price: string,
        public readonly description: string,
    ) {}
}
