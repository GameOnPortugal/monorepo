/**
 * Thrown when `RenewAd` is invoked against an ad that is not currently
 * `pending_renewal` — e.g. it already expired, was sold, deleted, or the
 * owner double-clicks a stale Renovar button after already renewing once.
 */
export class AdNotEligibleForRenewal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AdNotEligibleForRenewal';
    }
}
