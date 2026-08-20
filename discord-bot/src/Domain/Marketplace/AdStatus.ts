import { InvalidAdStatus } from './InvalidAdStatus';

/**
 * The ad lifecycle (M5.3, extended M6.5). A small value object rather than a
 * bare string — `AdId` and friends already extend `AbstractStringVo`, this
 * follows the same house style for a fixed set of values instead of an
 * arbitrary id.
 *
 * `pending_renewal` (M6.5) is the state between "idle 14+ days, owner DM'd"
 * and the outcome — either the owner clicks Renovar (back to `active`) or
 * 72h pass with no answer (`ads:lifecycle` moves it to `expired`). It is
 * deliberately a `status` value rather than a new column: while an ad is in
 * this state, `expires_at` is repurposed as *the response deadline* (see
 * `AdLifecyclePolicy.ts` and `AdsLifecycleJob.ts`) rather than adding a
 * `prompted_at` column whose only job would be to say "we are waiting on
 * this owner" — `status` already exists to say exactly that.
 */
const VALUES = ['active', 'pending_renewal', 'sold', 'expired', 'deleted'] as const;

export type AdStatusValue = (typeof VALUES)[number];

export class AdStatus {
    private constructor(public readonly value: AdStatusValue) {}

    public static active(): AdStatus {
        return new AdStatus('active');
    }

    /** M6.5 — owner has been asked whether an idle ad is still wanted; see the class doc comment. */
    public static pendingRenewal(): AdStatus {
        return new AdStatus('pending_renewal');
    }

    public static sold(): AdStatus {
        return new AdStatus('sold');
    }

    public static expired(): AdStatus {
        return new AdStatus('expired');
    }

    public static deleted(): AdStatus {
        return new AdStatus('deleted');
    }

    public static fromString(value: string): AdStatus {
        if (!(VALUES as readonly string[]).includes(value)) {
            throw new InvalidAdStatus(`Invalid ad status: ${value}`);
        }

        return new AdStatus(value as AdStatusValue);
    }

    public equals(other: AdStatus): boolean {
        return this.value === other.value;
    }

    public toString(): AdStatusValue {
        return this.value;
    }
}
