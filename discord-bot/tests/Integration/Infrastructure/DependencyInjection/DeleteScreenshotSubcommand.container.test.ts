import { describe, test, expect } from 'bun:test';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { DeleteScreenshotSubcommand } from '../../../../src/Infrastructure/Bot/Discord/SlashCommand/Screenshot/DeleteScreenshotSubcommand';

/**
 * Regression coverage for M0.6 (B4): `DeleteScreenshotSubcommand` was
 * missing `@injectable()` while its siblings (Create/List) had it. It is
 * bound with `.toSelf()` in inversify.config.ts, so a missing decorator
 * would only surface as a runtime resolution failure — asserting the
 * decorator is present is not enough, the container must actually be able
 * to build the class.
 */
describe('DI container — DeleteScreenshotSubcommand', () => {
    test('resolves DeleteScreenshotSubcommand without throwing', () => {
        let instance: DeleteScreenshotSubcommand | undefined;

        expect(() => {
            instance = myContainer.get(DeleteScreenshotSubcommand);
        }).not.toThrow();

        expect(instance).toBeInstanceOf(DeleteScreenshotSubcommand);
    });
});
