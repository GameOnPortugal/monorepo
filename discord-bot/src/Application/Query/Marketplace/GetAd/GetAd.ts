import type { AdId } from '../../../../Domain/Marketplace/AdId';

/**
 * M5.6 — a single-ad read, added for `EditAdSubcommand` to prefill the edit
 * modal with the ad's current price/description, and for the `mkt`
 * component handler's buttons to read the row a click refers to.
 */
export class GetAd {
    constructor(public readonly id: AdId) {}
}
