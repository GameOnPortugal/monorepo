import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { FindActiveAdsForReconcile } from '../../../../../../src/Application/Query/Marketplace/FindActiveAdsForReconcile/FindActiveAdsForReconcile';
import type { Ad } from '../../../../../../src/Domain/Marketplace/Ad';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';

describe('FindActiveAdsForReconcileHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('returns active ads, including orphaned ones, but not sold/expired/deleted/pending_renewal ads', async () => {
        const active = await createAd(undefined, 'Active');
        const orphanActive = await createAd(undefined, 'Orphan', undefined, undefined, '');
        await createAd(
            undefined,
            'Sold',
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
            undefined,
            AdStatus.sold(),
        );
        await createAd(
            undefined,
            'Expired',
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
            undefined,
            AdStatus.expired(),
        );
        await createAd(
            undefined,
            'Pending renewal',
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
            undefined,
            AdStatus.pendingRenewal(),
        );

        const result: Ad[] = await commandHandlerManager.handle(new FindActiveAdsForReconcile(200));

        expect(result.map((ad) => ad.id.toString()).sort()).toEqual(
            [active.id.toString(), orphanActive.id.toString()].sort(),
        );
    });

    it('respects the limit', async () => {
        for (let i = 0; i < 5; i++) {
            await createAd(undefined, `Ad ${i}`);
        }

        const result: Ad[] = await commandHandlerManager.handle(new FindActiveAdsForReconcile(3));

        expect(result).toHaveLength(3);
    });
});
