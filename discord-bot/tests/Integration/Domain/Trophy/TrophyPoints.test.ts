import { describe, test, expect } from 'bun:test';
import { calculateTrophyPoints } from '../../../../src/Domain/Trophy/TrophyPoints';

/**
 * Table-driven test over every band boundary of the rarity → TP ladder,
 * ported verbatim from
 * old-discord-bot/src/service/trophy/trophyManager.js#transformPercentageIntoPoints:
 *
 *   > 30.01% -> 50, > 15.01% -> 100, > 8.01% -> 250, > 5.01% -> 500,
 *   > 2.01% -> 800, > 0.6% -> 1250, <= 0.6% -> 2000.
 *
 * Every boundary is strictly "greater than", so the boundary value itself
 * falls into the *lower* (rarer, higher-points) band — each pair below
 * hits both sides of a boundary.
 */
describe('calculateTrophyPoints', () => {
    const cases: Array<[number, number, string]> = [
        [100, 50, 'well above the top boundary'],
        [30.02, 50, 'just above the 30.01 boundary'],
        [30.01, 100, 'exactly on the 30.01 boundary falls into the 100 band'],
        [30.0, 100, 'just below the 30.01 boundary'],

        [15.02, 100, 'just above the 15.01 boundary'],
        [15.01, 250, 'exactly on the 15.01 boundary falls into the 250 band'],
        [15.0, 250, 'just below the 15.01 boundary'],

        [8.02, 250, 'just above the 8.01 boundary'],
        [8.01, 500, 'exactly on the 8.01 boundary falls into the 500 band'],
        [8.0, 500, 'just below the 8.01 boundary'],

        [5.02, 500, 'just above the 5.01 boundary'],
        [5.01, 800, 'exactly on the 5.01 boundary falls into the 800 band'],
        [5.0, 800, 'just below the 5.01 boundary'],

        [2.02, 800, 'just above the 2.01 boundary'],
        [2.01, 1250, 'exactly on the 2.01 boundary falls into the 1250 band'],
        [2.0, 1250, 'just below the 2.01 boundary'],

        [0.61, 1250, 'just above the 0.6 boundary'],
        [0.6, 2000, 'exactly on the 0.6 boundary falls into the 2000 band'],
        [0.59, 2000, 'just below the 0.6 boundary'],
        [0.01, 2000, 'the rarest possible band'],
        [0, 2000, 'zero percent'],
    ];

    for (const [percentage, expectedPoints, description] of cases) {
        test(`${percentage}% -> ${expectedPoints} TP (${description})`, () => {
            expect(calculateTrophyPoints(percentage)).toBe(expectedPoints);
        });
    }
});
