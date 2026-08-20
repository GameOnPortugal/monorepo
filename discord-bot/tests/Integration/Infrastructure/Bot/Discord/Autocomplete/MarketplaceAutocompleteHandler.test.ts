import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { MarketplaceAutocompleteHandler } from '../../../../../../src/Infrastructure/Bot/Discord/Autocomplete/MarketplaceAutocompleteHandler';
import { AUTOCOMPLETE_MAX_CHOICES } from '../../../../../../src/Domain/Bot/AutocompleteHandler';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import FakeAutocompleteInteraction from '../../../../../Helper/FakeAutocompleteInteraction';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AutocompleteInteractionContext } from '../../../../../../src/Domain/Bot/InteractionContext';

const OWNER = '123456789012345678';
const SOMEONE_ELSE = '987654321098765432';

describe('MarketplaceAutocompleteHandler (M4.8)', () => {
    let handler: MarketplaceAutocompleteHandler;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        handler = myContainer.get<MarketplaceAutocompleteHandler>(MarketplaceAutocompleteHandler);
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
        const fake = new FakeAutocompleteInteraction('marketplace', focused, userId);
        return {
            context: { kind: 'autocomplete', interaction: fake.asAutocompleteInteraction() },
            fake,
        };
    }

    it('offers the invoking member their own ads, with the id as the value', async () => {
        const mine = await createAd(undefined, 'PS5 DualSense', OWNER);
        await createAd(undefined, 'Xbox Elite pad', SOMEONE_ELSE);

        const { context, fake } = run({ name: 'id', value: '' });
        await handler.handle(context);

        expect(fake.choices).toHaveLength(1);
        expect(fake.choices?.[0]?.value).toBe(mine.id.toString());
        expect(fake.choices?.[0]?.name).toContain('PS5 DualSense');
    });

    it('filters by what the member has typed so far', async () => {
        await createAd(undefined, 'PS5 DualSense', OWNER);
        const controller = await createAd(undefined, 'Xbox controller', OWNER);

        const { context, fake } = run({ name: 'id', value: 'xbox' });
        await handler.handle(context);

        expect(fake.choices).toHaveLength(1);
        expect(fake.choices?.[0]?.value).toBe(controller.id.toString());
    });

    it('does not offer an ad the member has already deleted', async () => {
        await createAd(
            undefined,
            'Deleted item',
            OWNER,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.deleted(),
        );

        const { context, fake } = run({ name: 'id', value: '' });
        await handler.handle(context);

        expect(fake.choices).toEqual([]);
    });

    it('answers empty for an option that is not the ad id', async () => {
        await createAd(undefined, 'PS5 DualSense', OWNER);

        const { context, fake } = run({ name: 'zone', value: 'por' });
        await handler.handle(context);

        expect(fake.choices).toEqual([]);
    });

    it('clamps to the 25 choices Discord accepts', async () => {
        // Over the limit is a 400 from the API, which the member experiences
        // as a suggestion box that simply never populates.
        for (let index = 0; index < AUTOCOMPLETE_MAX_CHOICES + 5; index += 1) {
            await createAd(undefined, `Item ${index}`, OWNER);
        }

        const { context, fake } = run({ name: 'id', value: '' });
        await handler.handle(context);

        expect(fake.choices).toHaveLength(AUTOCOMPLETE_MAX_CHOICES);
    });

    it("truncates a label past Discord's 100 character limit", async () => {
        // 191 characters is what a Prisma `String?` maps to in MySQL, so this is
        // the longest name the column can actually hold.
        await createAd(undefined, 'A'.repeat(191), OWNER);

        const { context, fake } = run({ name: 'id', value: '' });
        await handler.handle(context);

        expect(fake.choices?.[0]?.name.length).toBeLessThanOrEqual(100);
    });
});
