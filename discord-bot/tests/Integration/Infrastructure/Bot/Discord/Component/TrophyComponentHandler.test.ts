import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { TrophyComponentHandler } from '../../../../../../src/Infrastructure/Bot/Discord/Component/TrophyComponentHandler';
import { buildCustomId } from '../../../../../../src/Domain/Bot/CustomId';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import FakeComponentInteraction from '../../../../../Helper/FakeComponentInteraction';
import { createTrophyProfile, createTrophy } from '../../../../../Helper/StaticFixtures';
import type { ComponentInteractionContext } from '../../../../../../src/Domain/Bot/InteractionContext';

describe('TrophyComponentHandler Integration Test (M7.6)', () => {
    let handler: TrophyComponentHandler;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        handler = myContainer.get<TrophyComponentHandler>(TrophyComponentHandler);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    async function createRankedProfiles(count: number): Promise<void> {
        for (let i = 0; i < count; i++) {
            const profile = await createTrophyProfile(
                undefined,
                `${200000000000000000 + i}`,
                `Hunter${String(i).padStart(2, '0')}`,
            );
            await createTrophy(undefined, profile.id.toString(), undefined, count - i);
        }
    }

    function contextFor(customId: string): {
        context: ComponentInteractionContext;
        fake: FakeComponentInteraction;
    } {
        const fake = new FakeComponentInteraction(customId);
        return {
            context: { kind: 'component', interaction: fake.asButtonInteraction() },
            fake,
        };
    }

    it('claims the "trophies" namespace', () => {
        expect(handler.getNamespace()).toBe('trophies');
    });

    it('pages forward to the requested slice and updates the same message', async () => {
        await createRankedProfiles(5);

        const customId = buildCustomId('trophies', 'page', 'lifetime', '2', '2', '-', '-');
        const { context, fake } = contextFor(customId);

        await handler.handle(context);

        expect(fake.updateCalls).toHaveLength(1);
        expect(fake.replyCalls).toHaveLength(0);
        const description = fake.updateCalls[0].embeds[0].data.description as string;
        expect(description).toContain('Hunter02');
        expect(description).toContain('Hunter03');
        expect(description).not.toContain('Hunter00');
        expect(description).not.toContain('Hunter04');
    });

    it('paging back from page 2 lands back on page 1', async () => {
        await createRankedProfiles(4);

        // Go to page 2 first.
        const toPage2 = buildCustomId('trophies', 'page', 'lifetime', '2', '2', '-', '-');
        await handler.handle(contextFor(toPage2).context);

        // Then click what a page-2 render's "Anterior" button would carry.
        const backToPage1 = buildCustomId('trophies', 'page', 'lifetime', '1', '2', '-', '-');
        const { context, fake } = contextFor(backToPage1);
        await handler.handle(context);

        const description = fake.updateCalls[0].embeds[0].data.description as string;
        expect(description).toContain('Hunter00');
        expect(description).toContain('Hunter01');
    });

    it('clamps a page number beyond the last page instead of throwing or rendering empty', async () => {
        await createRankedProfiles(3);

        // 3 rows, page size 2 -> only 2 pages exist. Ask for page 999 —
        // e.g. a button built against a bigger leaderboard that has since
        // shrunk (a profile got excluded after the message was posted).
        const customId = buildCustomId('trophies', 'page', 'lifetime', '999', '2', '-', '-');
        const { context, fake } = contextFor(customId);

        await handler.handle(context);

        expect(fake.updateCalls).toHaveLength(1);
        const description = fake.updateCalls[0].embeds[0].data.description as string;
        expect(description).toContain('Hunter02');
        expect(description.length).toBeGreaterThan(0);
    });

    it('disables the "Anterior" button on page 1 and the "Próxima" button on the last page', async () => {
        await createRankedProfiles(3);

        const firstPageId = buildCustomId('trophies', 'page', 'lifetime', '1', '2', '-', '-');
        const { context: firstContext, fake: firstFake } = contextFor(firstPageId);
        await handler.handle(firstContext);

        const [firstRow] = firstFake.updateCalls[0].components;
        const [firstPrev, firstNext] = firstRow.components.map(
            (button: { data: Record<string, unknown> }) => button.data,
        );
        expect(firstPrev.disabled).toBe(true);
        expect(firstNext.disabled).toBe(false);

        const lastPageId = buildCustomId('trophies', 'page', 'lifetime', '2', '2', '-', '-');
        const { context: lastContext, fake: lastFake } = contextFor(lastPageId);
        await handler.handle(lastContext);

        const [lastRow] = lastFake.updateCalls[0].components;
        const [lastPrev, lastNext] = lastRow.components.map(
            (button: { data: Record<string, unknown> }) => button.data,
        );
        expect(lastPrev.disabled).toBe(false);
        expect(lastNext.disabled).toBe(true);
    });

    it('preserves the resolved month/year across pages for a monthly ranking', async () => {
        const april2024 = new Date(2024, 3, 15);
        for (let i = 0; i < 3; i++) {
            const profile = await createTrophyProfile(
                undefined,
                `${300000000000000000 + i}`,
                `AprilHunter${i}`,
            );
            await createTrophy(undefined, profile.id.toString(), undefined, 3 - i, april2024);
        }

        const customId = buildCustomId('trophies', 'page', 'monthly', '1', '2', '4', '2024');
        const { context, fake } = contextFor(customId);

        await handler.handle(context);

        const description = fake.updateCalls[0].embeds[0].data.description as string;
        expect(description).toContain('AprilHunter0');
        expect(description).toContain('AprilHunter1');
    });

    it('replies ephemerally without throwing when the custom ID does not decode', async () => {
        const { context, fake } = contextFor('trophies:page:not-a-real-type:1:10:-:-');

        await handler.handle(context);

        expect(fake.updateCalls).toHaveLength(0);
        expect(fake.replyCalls).toHaveLength(1);
        expect(fake.replyCalls[0].flags).toBeDefined();
    });

    it('replies ephemerally on an unparseable custom ID rather than crashing', async () => {
        const { context, fake } = contextFor('trophies:page');

        await handler.handle(context);

        expect(fake.updateCalls).toHaveLength(0);
        expect(fake.replyCalls).toHaveLength(1);
    });
});
