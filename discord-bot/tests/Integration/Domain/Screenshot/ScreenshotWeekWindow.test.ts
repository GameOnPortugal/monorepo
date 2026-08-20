import { describe, test, expect } from 'bun:test';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    COMMUNITY_TIMEZONE,
    computeWeekWindow,
    nextContestOpeningDay,
} from '../../../../src/Domain/Screenshot/ScreenshotWeekWindow.ts';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Builds the expected boundary instant from a Lisbon-local wall-clock string. */
const lisbon = (wallClock: string): Date => dayjs.tz(wallClock, COMMUNITY_TIMEZONE).toDate();

/**
 * M6.4: `findByWeek` used to derive its window from dayjs's locale-default
 * `startOf('week')`/`endOf('week')`, which (with no locale configured) is a
 * Sunday->Saturday span, not the Monday->Sunday span the old bot used
 * (`old-discord-bot/src/service/screenshot/screenshotManager.js`,
 * `findAllScreenshotsForThisWeek`, dayjs `weekday(-6)`/`weekday(0)`). These
 * tests pin `computeWeekWindow` — the ported replacement — against that old
 * behaviour and its explicit Europe/Lisbon timezone assumption.
 */
describe('computeWeekWindow', () => {
    test("a mid-week reference (winter, WET/UTC+0) resolves to that week's Monday->Sunday", () => {
        // Thursday 2026-01-15, 15:00 UTC == 15:00 Lisbon local (WET, no DST in January).
        const window = computeWeekWindow(new Date('2026-01-15T15:00:00Z'));

        expect(window.start).toEqual(lisbon('2026-01-05 00:00:00.000'));
        expect(window.end).toEqual(lisbon('2026-01-11 23:59:59.999'));
    });

    test("a mid-week reference (summer, WEST/UTC+1) resolves to that week's Monday->Sunday", () => {
        // Thursday 2026-07-16, 15:00 UTC == 16:00 Lisbon local (WEST, DST active).
        const window = computeWeekWindow(new Date('2026-07-16T15:00:00Z'));

        expect(window.start).toEqual(lisbon('2026-07-06 00:00:00.000'));
        expect(window.end).toEqual(lisbon('2026-07-12 23:59:59.999'));
    });

    test('the Sunday-23:59 edge: a reference at the very end of Sunday closes that same week', () => {
        // The job is scheduled for Sun 23:50 — this is exactly that case.
        const reference = lisbon('2026-01-11 23:50:00.000'); // Sunday
        const window = computeWeekWindow(reference);

        expect(window.start).toEqual(lisbon('2026-01-05 00:00:00.000'));
        expect(window.end).toEqual(lisbon('2026-01-11 23:59:59.999'));
    });

    test('the Monday-00:00 edge: a reference at the very start of Monday belongs to the PREVIOUS, already-completed week', () => {
        // Not the week that is only just starting — that one has not been
        // decided yet. This mirrors the old bot's `weekday(0)`/`weekday(-6)`
        // math, which always looks backward from "now".
        const reference = lisbon('2026-01-12 00:00:00.000'); // Monday, the instant the new week begins
        const window = computeWeekWindow(reference);

        expect(window.start).toEqual(lisbon('2026-01-05 00:00:00.000'));
        expect(window.end).toEqual(lisbon('2026-01-11 23:59:59.999'));
    });

    test("one millisecond into the new week already excludes the closed week's Sunday", () => {
        const reference = lisbon('2026-01-12 00:00:00.001');
        const window = computeWeekWindow(reference);

        // Still the previous week: 2026-01-12 has not completed a week yet.
        expect(window.end).toEqual(lisbon('2026-01-11 23:59:59.999'));

        const laterReference = lisbon('2026-01-18 23:59:59.999'); // following Sunday, last instant
        const laterWindow = computeWeekWindow(laterReference);
        expect(laterWindow.start).toEqual(lisbon('2026-01-12 00:00:00.000'));
        expect(laterWindow.end).toEqual(lisbon('2026-01-18 23:59:59.999'));
    });
});

describe('nextContestOpeningDay', () => {
    test('is the Monday immediately after the window closes', () => {
        const window = computeWeekWindow(new Date('2026-01-15T15:00:00Z'));

        expect(nextContestOpeningDay(window)).toEqual(lisbon('2026-01-12 00:00:00.000'));
    });
});
