import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { ScreenshotAutocompleteHandler } from '../../../../../../src/Infrastructure/Bot/Discord/Autocomplete/ScreenshotAutocompleteHandler';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import FakeAutocompleteInteraction from '../../../../../Helper/FakeAutocompleteInteraction';
import { createScreenshot } from '../../../../../Helper/StaticFixtures';
import type { AutocompleteInteractionContext } from '../../../../../../src/Domain/Bot/InteractionContext';

const OWNER = '123456789012345678';
const SOMEONE_ELSE = '987654321098765432';

describe('ScreenshotAutocompleteHandler (M4.8)', () => {
    let handler: ScreenshotAutocompleteHandler;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        handler = myContainer.get<ScreenshotAutocompleteHandler>(ScreenshotAutocompleteHandler);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function run(
        focused: { name: string; value: string },
        userId = OWNER,
    ): { context: AutocompleteInteractionContext; fake: FakeAutocompleteInteraction } {
        const fake = new FakeAutocompleteInteraction('screenshot', focused, userId);
        return {
            context: { kind: 'autocomplete', interaction: fake.asAutocompleteInteraction() },
            fake,
        };
    }

    it("offers only the invoking member's own screenshots", async () => {
        const mine = await createScreenshot(undefined, 'Ghost of Tsushima', OWNER);
        await createScreenshot(undefined, 'Halo', SOMEONE_ELSE);

        const { context, fake } = run({ name: 'id', value: '' });
        await handler.handle(context);

        expect(fake.choices).toHaveLength(1);
        expect(fake.choices?.[0]?.value).toBe(mine.id.toString());
        expect(fake.choices?.[0]?.name).toContain('Ghost of Tsushima');
    });

    it('tolerates the leading # the id is displayed with', async () => {
        // `/screenshot delete` has always accepted `#<id>` because that is
        // the form the bot prints. Typing the `#` first must not filter the
        // member's own screenshots down to nothing.
        const mine = await createScreenshot(undefined, 'Ghost of Tsushima', OWNER);

        const { context, fake } = run({ name: 'id', value: '#ghost' });
        await handler.handle(context);

        expect(fake.choices).toHaveLength(1);
        expect(fake.choices?.[0]?.value).toBe(mine.id.toString());
    });

    it('answers empty for an option that is not the screenshot id', async () => {
        await createScreenshot(undefined, 'Ghost of Tsushima', OWNER);

        const { context, fake } = run({ name: 'name', value: 'gho' });
        await handler.handle(context);

        expect(fake.choices).toEqual([]);
    });
});
