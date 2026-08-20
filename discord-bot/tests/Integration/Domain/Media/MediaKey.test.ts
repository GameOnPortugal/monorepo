import { describe, test, expect } from 'bun:test';
import {
    adPhotoMediaKey,
    normalizeMediaExtension,
    screenshotMediaKey,
} from '../../../../src/Domain/Media/MediaKey.ts';

describe('MediaKey', () => {
    describe('screenshotMediaKey', () => {
        test('is deterministic — the same id and extension always produce the same key', () => {
            const id = '019e8451-dbe7-7391-8a2b-abcdef123456';

            expect(screenshotMediaKey(id, 'png')).toBe(screenshotMediaKey(id, 'png'));
            expect(screenshotMediaKey(id, 'png')).toBe(`screenshots/${id}.png`);
        });

        test('different ids never collide', () => {
            const a = screenshotMediaKey('019e8451-dbe7-7391-8a2b-abcdef123456', 'png');
            const b = screenshotMediaKey('029e8451-dbe7-7391-8a2b-abcdef123456', 'png');

            expect(a).not.toBe(b);
        });

        test('never embeds anything but the id and extension (no user id smuggled in)', () => {
            const id = '019e8451-dbe7-7391-8a2b-abcdef123456';

            expect(screenshotMediaKey(id, 'PNG')).toBe(`screenshots/${id}.png`);
        });

        test('rejects an empty id', () => {
            expect(() => screenshotMediaKey('', 'png')).toThrow();
        });
    });

    describe('adPhotoMediaKey', () => {
        test('is deterministic and namespaced by ad id and index', () => {
            const adId = '019e8451-dbe7-7391-8a2b-abcdef123456';

            expect(adPhotoMediaKey(adId, 0, 'jpg')).toBe(`ads/${adId}/0.jpg`);
            expect(adPhotoMediaKey(adId, 0, 'jpg')).toBe(adPhotoMediaKey(adId, 0, 'jpg'));
        });

        test('different indexes on the same ad never collide', () => {
            const adId = '019e8451-dbe7-7391-8a2b-abcdef123456';

            expect(adPhotoMediaKey(adId, 0, 'jpg')).not.toBe(adPhotoMediaKey(adId, 1, 'jpg'));
        });

        test('rejects a negative or non-integer index', () => {
            expect(() => adPhotoMediaKey('ad-1', -1, 'jpg')).toThrow();
            expect(() => adPhotoMediaKey('ad-1', 1.5, 'jpg')).toThrow();
        });

        test('rejects an empty ad id', () => {
            expect(() => adPhotoMediaKey('', 0, 'jpg')).toThrow();
        });
    });

    describe('normalizeMediaExtension', () => {
        test('lowercases and strips a leading dot', () => {
            expect(normalizeMediaExtension('.PNG')).toBe('png');
            expect(normalizeMediaExtension('JPG')).toBe('jpg');
        });

        test('rejects an extension that could break out of the key path', () => {
            expect(() => normalizeMediaExtension('png/../../etc')).toThrow();
            expect(() => normalizeMediaExtension('')).toThrow();
            expect(() => normalizeMediaExtension('png?x=1')).toThrow();
        });
    });
});
