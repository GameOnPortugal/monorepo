import { describe, test, expect } from 'bun:test';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import { PsnProfilesTrophySource } from '../../../../src/Infrastructure/Trophy/PsnProfilesTrophySource';
import type { TrophySource } from '../../../../src/Domain/Trophy/TrophySource';

/**
 * M7.1: TYPES.TrophySource -> PsnProfilesTrophySource. "Nothing is
 * reachable until it is bound" (AGENT.md) — this asserts the container can
 * actually build it, not just that the class carries `@injectable()`.
 */
describe('DI container — TrophySource', () => {
    test('resolves TYPES.TrophySource to a PsnProfilesTrophySource without throwing', () => {
        let instance: TrophySource | undefined;

        expect(() => {
            instance = myContainer.get<TrophySource>(TYPES.TrophySource);
        }).not.toThrow();

        expect(instance).toBeInstanceOf(PsnProfilesTrophySource);
    });
});
