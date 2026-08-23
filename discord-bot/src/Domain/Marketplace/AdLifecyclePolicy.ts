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

/**
 * The absolute ceiling on how long an ad may sit `active` — decision 3 of
 * plan 02 ("30-day expiry"), which the M6.5 build implemented only as the
 * 14-day-idle DM and never as a hard limit.
 *
 * It exists because every path to expiry before it went through a DM the
 * owner has to receive, and a DM is not guaranteed to arrive: closed DMs,
 * a member who left the guild, or a send that throws all leave the ad
 * `active` forever. Production proved it — 5 ads whose `expires_at` passed
 * on 2025-05-10 were still listed on 2026-08-23, re-DM'd and re-skipped
 * (`recipientsDmClosed: 1`) once a day, because "skip and carry on" has no
 * exit. This is the exit: past `expires_at`, the ad expires whether or not
 * anyone could be reached.
 *
 * It is a backstop, not the normal path. An ad that is reachable is
 * prompted at day 14 and settled by day 17, well inside the 30 — so this
 * only ever bites the cases where the courtesy DM could not be delivered.
 */
export const AD_LIFECYCLE_MAX_AGE_DAYS = 30;

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * MS_PER_DAY);
}
