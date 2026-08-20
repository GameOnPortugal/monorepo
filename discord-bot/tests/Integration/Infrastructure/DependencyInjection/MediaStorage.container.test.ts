import { describe, test, expect } from 'bun:test';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import { InMemoryMediaStorage } from '../../../../src/Infrastructure/Media/InMemoryMediaStorage';
import type { MediaStorage } from '../../../../src/Domain/Media/MediaStorage';

/**
 * M6.0: TYPES.MediaStorage must be reachable through the container — "nothing
 * is reachable until it is bound" (GLOBAL-PLAN.md cross-cutting rule 6).
 *
 * The test environment (.env.test) sets no S3_* vars, so this also pins the
 * fallback behaviour: without S3 configuration the bot must bind
 * InMemoryMediaStorage rather than fail to boot, the same shape as
 * InMemoryClient's fallback for a missing DISCORD_TOKEN.
 */
describe('DI container — MediaStorage', () => {
    test('resolves TYPES.MediaStorage without throwing', () => {
        let instance: MediaStorage | undefined;

        expect(() => {
            instance = myContainer.get<MediaStorage>(TYPES.MediaStorage);
        }).not.toThrow();

        expect(instance).toBeDefined();
    });

    test('falls back to InMemoryMediaStorage when S3_* is unset', () => {
        expect(process.env.S3_ENDPOINT).toBeUndefined();

        const instance = myContainer.get<MediaStorage>(TYPES.MediaStorage);

        expect(instance).toBeInstanceOf(InMemoryMediaStorage);
    });
});
