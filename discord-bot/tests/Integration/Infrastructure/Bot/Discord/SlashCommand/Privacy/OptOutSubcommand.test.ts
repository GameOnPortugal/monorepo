import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { MessageFlags } from 'discord.js';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { OptOutSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Privacy/OptOutSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import type { PrivacyRepository } from '../../../../../../../src/Domain/Privacy/PrivacyRepository';

describe('OptOutSubcommand Integration Test', () => {
    let optOutSubcommand: OptOutSubcommand;
    let privacyRepository: PrivacyRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        optOutSubcommand = myContainer.get<OptOutSubcommand>(OptOutSubcommand);
        privacyRepository = myContainer.get<PrivacyRepository>(TYPES.PrivacyRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function buildContext(interaction: FakeInteraction): SlashCommandContext {
        return {
            kind: 'chat-input',
            channel_id: interaction.channelId,
            command: 'privacy',
            text: '',
            interaction: interaction.asChatInputCommandInteraction(),
        };
    }

    test('replies ephemerally, in pt-PT, and persists the opt-out', async () => {
        const userId = '111111111111111111';
        const interaction = new FakeInteraction({}, userId);

        await optOutSubcommand.handle(buildContext(interaction));

        expect(interaction.replyCalls.length).toBe(1);
        expect(interaction.replyCalls[0].flags).toBe(MessageFlags.Ephemeral);
        expect(interaction.replyCalls[0].content).toContain('Deixaste de aparecer publicamente');
        expect(interaction.replyCalls[0].content).toContain('/privacy opt-in');

        expect(await privacyRepository.isOptedOut(userId)).toBe(true);
    });

    test('is idempotent — opting out twice leaves the member opted out', async () => {
        const userId = '222222222222222222';

        await optOutSubcommand.handle(buildContext(new FakeInteraction({}, userId)));
        await optOutSubcommand.handle(buildContext(new FakeInteraction({}, userId)));

        expect(await privacyRepository.isOptedOut(userId)).toBe(true);
    });
});
