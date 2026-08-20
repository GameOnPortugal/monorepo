/**
 * Raised when `bump` (M5.6) is attempted before `AD_BUMP_COOLDOWN_MS` has
 * passed since the ad's last bump (`AdBumpPolicy.ts`). Carries
 * `nextEligibleAt` so a caller (the button handler, the `/marketplace bump`
 * subcommand) can tell the member exactly when they can try again instead of
 * a bare "not yet".
 */
export class AdBumpRateLimited extends Error {
    constructor(
        message: string,
        public readonly nextEligibleAt: Date,
    ) {
        super(message);
        this.name = 'AdBumpRateLimited';
    }
}
