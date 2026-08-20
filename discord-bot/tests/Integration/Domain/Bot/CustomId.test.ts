import { describe, expect, it } from 'bun:test';
import {
    buildCustomId,
    parseCustomId,
    InvalidCustomId,
    CUSTOM_ID_MAX_LENGTH,
} from '../../../../src/Domain/Bot/CustomId';

describe('CustomId (M4.7)', () => {
    it('round-trips a namespace, action and args', () => {
        const customId = buildCustomId('mkt', 'sold', 'b0a1c2d3-e4f5-4678-9abc-def012345678');

        expect(customId).toBe('mkt:sold:b0a1c2d3-e4f5-4678-9abc-def012345678');
        expect(parseCustomId(customId)).toEqual({
            namespace: 'mkt',
            action: 'sold',
            args: ['b0a1c2d3-e4f5-4678-9abc-def012345678'],
        });
    });

    it('builds an id with no args', () => {
        expect(parseCustomId(buildCustomId('mkt', 'cancel'))).toEqual({
            namespace: 'mkt',
            action: 'cancel',
            args: [],
        });
    });

    it('rejects a segment containing the separator, rather than silently producing an extra arg', () => {
        // Without this guard, buildCustomId('mkt', 'sold', 'a:b') would parse
        // back as args ['a', 'b'] — a handler reading args[0] would get half
        // an id and act on the wrong record.
        expect(() => buildCustomId('mkt', 'sold', 'a:b')).toThrow(InvalidCustomId);
    });

    it('rejects an empty segment', () => {
        expect(() => buildCustomId('mkt', '')).toThrow(InvalidCustomId);
    });

    it("throws rather than truncating past Discord's 100 character limit", () => {
        // A truncated custom ID is not a shorter custom ID — it is a button
        // that routes nowhere once clicked, days later, in production.
        const tooLong = 'x'.repeat(CUSTOM_ID_MAX_LENGTH);

        expect(() => buildCustomId('mkt', 'sold', tooLong)).toThrow(InvalidCustomId);
    });

    it('accepts an id of exactly the limit', () => {
        const fill = 'x'.repeat(CUSTOM_ID_MAX_LENGTH - 'mkt:sold:'.length);

        expect(buildCustomId('mkt', 'sold', fill)).toHaveLength(CUSTOM_ID_MAX_LENGTH);
    });

    it('returns null for a custom ID that is not ours, instead of throwing', () => {
        // Components outlive the code that made them, and a guild may host
        // other apps. "Not ours" is an ordinary dispatcher outcome.
        expect(parseCustomId('some-other-app-button')).toBeNull();
        expect(parseCustomId('')).toBeNull();
        expect(parseCustomId('mkt:')).toBeNull();
        expect(parseCustomId(':sold:1')).toBeNull();
        expect(parseCustomId('mkt:sold:')).toBeNull();
    });
});
