import { describe, test, expect } from 'bun:test';
import { InMemoryMediaStorage } from '../../../../src/Infrastructure/Media/InMemoryMediaStorage.ts';

describe('InMemoryMediaStorage', () => {
    test('exists() is false before put(), true after, and false again after delete()', async () => {
        const storage = new InMemoryMediaStorage();
        const object = {
            key: 'screenshots/x.png',
            body: new Uint8Array([1]),
            contentType: 'image/png',
        };

        expect(await storage.exists(object.key)).toBe(false);

        await storage.put(object);
        expect(await storage.exists(object.key)).toBe(true);

        await storage.delete(object.key);
        expect(await storage.exists(object.key)).toBe(false);
    });

    test('delete() on a key that was never written does not throw (idempotent)', async () => {
        const storage = new InMemoryMediaStorage();

        await expect(storage.delete('never/written.png')).resolves.toBeUndefined();
    });

    test('put() returns a stable, key-derived URL', async () => {
        const storage = new InMemoryMediaStorage();

        const url = await storage.put({
            key: 'ads/ad-1/0.png',
            body: new Uint8Array(),
            contentType: 'image/png',
        });

        expect(url).toBe('memory://ads/ad-1/0.png');
    });
});
