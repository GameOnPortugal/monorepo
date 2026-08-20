import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { GetAd } from '../../../../../../src/Application/Query/Marketplace/GetAd/GetAd';
import { AdId } from '../../../../../../src/Domain/Marketplace/AdId';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';
import RecordNotFound from '../../../../../../src/Domain/RecordNotFound.ts';

describe('GetAdHandler Integration Test', () => {
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

    it('returns the ad by id', async () => {
        const ad = await createAd(undefined, 'Test Ad', '123456789012345678');

        const result = await commandHandlerManager.handle(new GetAd(ad.id));

        expect(result.id.toString()).toBe(ad.id.toString());
        expect(result.name).toBe('Test Ad');
    });

    it('throws RecordNotFound for a non-existent ad', async () => {
        await expect(commandHandlerManager.handle(new GetAd(AdId.generate()))).rejects.toThrow(
            RecordNotFound,
        );
    });
});
