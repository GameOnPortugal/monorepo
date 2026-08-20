import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * The Game On Portugal community is based in mainland Portugal, which
 * observes WET (UTC+0) in winter and WEST (UTC+1) during DST. Every "week"
 * boundary for the screenshot contest is computed against this timezone,
 * regardless of what timezone the process itself happens to run in.
 *
 * This matters: the production container has no `TZ` set, so its local time
 * is UTC. Without pinning the calculation to Europe/Lisbon, the Monday/Sunday
 * cut would silently be off by an hour for roughly half the year (DST), and
 * a screenshot posted late on a Sunday night could land in the wrong week
 * depending on which server the process happened to be running on.
 */
export const COMMUNITY_TIMEZONE = 'Europe/Lisbon';

export interface WeekWindow {
    /** Monday 00:00:00.000, Portugal local time. */
    start: Date;
    /** Sunday 23:59:59.999, Portugal local time. */
    end: Date;
}

/**
 * Mirrors the old bot's `findAllScreenshotsForThisWeek`
 * (old-discord-bot/src/service/screenshot/screenshotManager.js), which used
 * dayjs's Sunday-based `weekday()` plugin: `weekday(-6)` for "last Monday",
 * `weekday(0)` for "last Sunday", both relative to "now".
 *
 * Given *any* reference instant, this returns the most recently **completed**
 * Monday->Sunday window: if `referenceDate` falls mid-week, the result is
 * *last* week, not the one still in progress. If `referenceDate` itself is a
 * Sunday, that Sunday is treated as the closing day of the window — which is
 * exactly the case the weekly job hits, since it is scheduled for Sun 23:50
 * (docs/plans/02-scheduler-and-lifecycle.md) to close out the week that is
 * finishing that very night.
 */
export function computeWeekWindow(referenceDate: Date): WeekWindow {
    const reference = dayjs.tz(referenceDate, COMMUNITY_TIMEZONE);
    const daysSinceSunday = reference.day(); // 0 (Sun) .. 6 (Sat), Sunday-based like the old bot.

    const end = reference.subtract(daysSinceSunday, 'day').endOf('day');
    const start = end.subtract(6, 'day').startOf('day');

    return { start: start.toDate(), end: end.toDate() };
}

/**
 * The Monday that opens the *next* contest, the day immediately after
 * `window` closes. Mirrors the old bot's closing banner, which announced
 * `dayjs().add(1, 'day')` right after posting the winner.
 */
export function nextContestOpeningDay(window: WeekWindow): Date {
    return dayjs.tz(window.end, COMMUNITY_TIMEZONE).add(1, 'day').startOf('day').toDate();
}
