/**
 * The filters `/marketplace search` (M5.9) accepts, and what
 * `AdRepository.search()`/`countSearch()` actually filter on in the
 * database — never in JS. Pulling 70+ (and growing) rows into the process
 * just to `.filter()` them in memory is exactly the pattern
 * `ScreenshotRepository.findRequiringRelink()` avoids for the same reason:
 * it stops being O(1) round trips and starts being O(rows), and it is the
 * kind of thing that works fine in a 70-row table and quietly rots later.
 *
 * Every field is optional — an empty criteria object means "every active
 * ad", which is a deliberate, valid search (a plain `/marketplace search`
 * with no options is "show me what's on sale").
 */
export interface AdSearchCriteria {
    /** Matched against `name`/`description` with a case-insensitive substring match. */
    readonly keyword?: string;
    /** Matched against `zone` with a case-insensitive substring match — free text, same as the `sell`/`wanted` zone option. */
    readonly zone?: string;
    /** `'sell' | 'wanted'` — matches the normalised `adType` (see AdType.ts). */
    readonly adType?: string;
    /** One of the `state` choice values `sell`/`wanted` already use (`new`, `like_new`, ...). */
    readonly condition?: string;
    /** Inclusive upper bound in cents. Only ads with a parsed `price_cents` can match — see CreateAdHandler/EditAdHandler for when that gets populated. */
    readonly maxPriceCents?: number;
}
