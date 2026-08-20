/**
 * M6.5's settled timings (docs/plans/02-scheduler-and-lifecycle.md, decision
 * 3): an ad idle for `AD_LIFECYCLE_IDLE_DAYS` gets a renewal DM, and has
 * `AD_LIFECYCLE_RESPONSE_HOURS` to answer before `ads:lifecycle` expires it.
 *
 * Plain millisecond arithmetic rather than a date library: these are fixed
 * durations, not calendar-aware operations (no month/DST edge cases to get
 * wrong), so pulling in dayjs here would be weight for nothing.
 */
export const AD_LIFECYCLE_IDLE_DAYS = 14;
export const AD_LIFECYCLE_RESPONSE_HOURS = 72;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export function subtractDays(date: Date, days: number): Date {
    return new Date(date.getTime() - days * MS_PER_DAY);
}

export function addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * MS_PER_HOUR);
}
