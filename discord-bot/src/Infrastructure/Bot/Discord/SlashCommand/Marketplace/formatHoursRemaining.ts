/**
 * Formats "how long until `nextEligibleAt`" as whole hours for the
 * `AdBumpRateLimited` message (M5.6), rounding up so "44 minutes left"
 * reads as "1h" rather than "0h" — a member should never be told to try
 * again *right now* and get rate-limited a second time.
 */
export function formatHoursRemaining(nextEligibleAt: Date, now: Date = new Date()): string {
    const msRemaining = nextEligibleAt.getTime() - now.getTime();
    const hoursRemaining = Math.max(1, Math.ceil(msRemaining / (60 * 60 * 1000)));
    return `${hoursRemaining}h`;
}
