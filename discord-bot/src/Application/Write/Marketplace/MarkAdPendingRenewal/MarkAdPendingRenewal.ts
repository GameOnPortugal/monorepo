import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

/**
 * M6.5 — records that the owner has just been DM'd about an idle ad.
 * `respondBy` is the 72h response deadline; it is stored in `expires_at`
 * (repurposed while `status='pending_renewal'` — see `AdStatus`'s doc
 * comment) rather than a new column.
 */
export class MarkAdPendingRenewal implements Command {
    constructor(
        public readonly id: AdId,
        public readonly respondBy: Date,
    ) {}
}
