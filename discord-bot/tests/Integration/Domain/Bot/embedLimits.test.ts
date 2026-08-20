import { describe, test, expect } from 'bun:test';
import {
    EMBED_FIELD_NAME_MAX_LENGTH,
    EMBED_FIELD_VALUE_MAX_LENGTH,
    EMBED_MAX_FIELDS,
    MESSAGE_MAX_LENGTH,
    capFields,
    chunkMessage,
    truncate,
    truncateFieldName,
    truncateFieldValue,
} from '../../../../src/Domain/Bot/embedLimits';

/**
 * Unit coverage for M4.10 (output-size safety). Nothing in this codebase
 * enforced Discord's embed/message limits before: `ListAdsSubcommand` added
 * one field per ad with no cap at all, so a user with 26+ listings — or a
 * single over-long field value — broke the command outright instead of
 * degrading gracefully.
 */
describe('embedLimits', () => {
    describe('truncate', () => {
        test('returns the value unchanged when within the limit', () => {
            expect(truncate('hello', 10)).toBe('hello');
        });

        test('truncates with an ellipsis when over the limit, not by throwing', () => {
            const result = truncate('x'.repeat(20), 10);

            expect(result.length).toBe(10);
            expect(result.endsWith('…')).toBe(true);
        });
    });

    describe('truncateFieldName / truncateFieldValue', () => {
        test('truncateFieldName respects the 256-character embed field name limit', () => {
            const result = truncateFieldName('n'.repeat(500));

            expect(result.length).toBeLessThanOrEqual(EMBED_FIELD_NAME_MAX_LENGTH);
        });

        test('truncateFieldValue respects the 1024-character embed field value limit', () => {
            const result = truncateFieldValue('v'.repeat(5000));

            expect(result.length).toBeLessThanOrEqual(EMBED_FIELD_VALUE_MAX_LENGTH);
            expect(result.endsWith('…')).toBe(true);
        });
    });

    describe('capFields', () => {
        test('does not throw on a field value far past the 1024-character limit — it truncates instead', () => {
            const items = [{ label: 'one', body: 'x'.repeat(5000) }];

            const { fields } = capFields(items, (item) => ({
                name: item.label,
                value: item.body,
            }));

            expect(fields).toHaveLength(1);
            const value = fields[0]?.value ?? '';
            expect(value.length).toBeLessThanOrEqual(EMBED_FIELD_VALUE_MAX_LENGTH);
            expect(value.endsWith('…')).toBe(true);
        });

        test('caps at 25 fields (Discord hard limit) and reports the omitted count', () => {
            const items = Array.from({ length: 30 }, (_, i) => ({
                label: `#${i + 1}`,
                body: 'ok',
            }));

            const { fields, omittedCount, omittedItems } = capFields(items, (item) => ({
                name: item.label,
                value: item.body,
            }));

            expect(fields.length).toBeLessThanOrEqual(EMBED_MAX_FIELDS);
            expect(fields).toHaveLength(25);
            expect(omittedCount).toBe(5);
            expect(omittedItems).toHaveLength(5);
        });

        test('respects a smaller command-specific maxFields (e.g. /screenshot list at 10)', () => {
            const items = Array.from({ length: 15 }, (_, i) => ({
                label: `#${i + 1}`,
                body: 'ok',
            }));

            const { fields, omittedCount } = capFields(
                items,
                (item) => ({ name: item.label, value: item.body }),
                0,
                10,
            );

            expect(fields).toHaveLength(10);
            expect(omittedCount).toBe(5);
        });

        test('also stops before 25 fields once the embed-wide 6000-character budget is spent', () => {
            // Each field alone is within the per-field 1024 limit, but 25 of
            // them would total well past the 6000-character embed budget.
            const items = Array.from({ length: 25 }, (_, i) => ({
                label: `#${i + 1}`,
                body: 'y'.repeat(1000),
            }));

            const { fields, omittedCount } = capFields(items, (item) => ({
                name: item.label,
                value: item.body,
            }));

            expect(fields.length).toBeLessThan(25);
            expect(omittedCount).toBeGreaterThan(0);

            const totalLength = fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
            expect(totalLength).toBeLessThanOrEqual(6000);
        });
    });

    describe('chunkMessage', () => {
        test('returns a single chunk when the text is within the limit', () => {
            expect(chunkMessage('hello world')).toEqual(['hello world']);
        });

        test('returns an empty array for empty text', () => {
            expect(chunkMessage('')).toEqual([]);
        });

        test('splits over-long text into chunks no longer than the limit', () => {
            const text = 'a'.repeat(4500);

            const chunks = chunkMessage(text);

            expect(chunks.length).toBeGreaterThan(1);
            for (const chunk of chunks) {
                expect(chunk.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
            }
            expect(chunks.join('')).toBe(text);
        });

        test('prefers to split on a line boundary rather than mid-line', () => {
            const line = 'x'.repeat(100);
            const text = Array.from({ length: 25 }, () => line).join('\n'); // ~2524 chars

            const chunks = chunkMessage(text, 1000);

            expect(chunks.length).toBeGreaterThan(1);
            // None of the chunks should end mid-line (cutting a 100-char line
            // in half) — every chunk boundary lands on a full line.
            for (const chunk of chunks) {
                const lines = chunk.split('\n');
                for (const l of lines) {
                    expect(l.length === 100 || l.length === 0).toBe(true);
                }
            }
        });
    });
});
