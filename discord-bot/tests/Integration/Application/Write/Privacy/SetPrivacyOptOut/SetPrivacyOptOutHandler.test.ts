import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { SetPrivacyOptOut } from '../../../../../../src/Application/Write/Privacy/SetPrivacyOptOut/SetPrivacyOptOut';
import type { PrivacyRepository } from '../../../../../../src/Domain/Privacy/PrivacyRepository';

describe('SetPrivacyOptOutHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let privacyRepository: PrivacyRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        privacyRepository = myContainer.get<PrivacyRepository>(TYPES.PrivacyRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('a member with no row is opted in by default', async () => {
        expect(await privacyRepository.isOptedOut('never-touched-user')).toBe(false);
    });

    test('opting out round-trips: it is readable back as opted-out', async () => {
        const userId = 'user-opting-out';

        await commandHandlerManager.handle(new SetPrivacyOptOut(userId, true));

        expect(await privacyRepository.isOptedOut(userId)).toBe(true);

        const row = await ormClient.privacySetting.findUnique({ where: { discordId: userId } });
        expect(row?.publicOptOut).toBe(true);
    });

    test('opting back in round-trips: opt-out followed by opt-in is readable as opted-in again', async () => {
        const userId = 'user-opting-back-in';

        await commandHandlerManager.handle(new SetPrivacyOptOut(userId, true));
        expect(await privacyRepository.isOptedOut(userId)).toBe(true);

        await commandHandlerManager.handle(new SetPrivacyOptOut(userId, false));
        expect(await privacyRepository.isOptedOut(userId)).toBe(false);
    });
});
