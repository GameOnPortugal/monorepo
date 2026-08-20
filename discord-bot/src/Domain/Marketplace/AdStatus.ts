import { InvalidAdStatus } from './InvalidAdStatus';

/**
 * The ad lifecycle (M5.3). A small value object rather than a bare string —
 * `AdId` and friends already extend `AbstractStringVo`, this follows the same
 * house style for a fixed set of values instead of an arbitrary id.
 */
const VALUES = ['active', 'sold', 'expired', 'deleted'] as const;

export type AdStatusValue = (typeof VALUES)[number];

export class AdStatus {
    private constructor(public readonly value: AdStatusValue) {}

    public static active(): AdStatus {
        return new AdStatus('active');
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
