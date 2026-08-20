/** M6.6 — every non-deleted `active` ad, up to `limit`. */
export class FindActiveAdsForReconcile {
    constructor(public readonly limit: number) {}
}
