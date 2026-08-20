import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { MarkAdPendingRenewal } from '../../../../../../src/Application/Write/Marketplace/MarkAdPendingRenewal/MarkAdPendingRenewal';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../../src/Domain/Marketplace/AdRepository';

describe('MarkAdPendingRenewalHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;
    let adRepository: AdRepository;

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('moves an active ad to pending_renewal and stores the response deadline in expires_at', async () => {
        const ad = await createAd();
        const respondBy = new Date('2026-08-23T10:00:00Z');

        await commandHandlerManager.handle(new MarkAdPendingRenewal(ad.id, respondBy));

        const updated = await adRepository.get(ad.id);
        expect(updated.status.toString()).toBe('pending_renewal');
        expect(updated.expiresAt).toEqual(respondBy);
    });

    it('is idempotent: does nothing to an ad that is no longer active', async () => {
        const ad = await createAd(
            undefined,
            'Test Ad',
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

        await commandHandlerManager.handle(new MarkAdPendingRenewal(ad.id, new Date()));

        const stillThere = await adRepository.get(ad.id);
        expect(stillThere.status.toString()).toBe('sold');
    });
});
