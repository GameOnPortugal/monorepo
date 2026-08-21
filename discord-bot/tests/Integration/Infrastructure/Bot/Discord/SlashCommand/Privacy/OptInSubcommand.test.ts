import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { MessageFlags } from 'discord.js';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { OptInSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Privacy/OptInSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import type { PrivacyRepository } from '../../../../../../../src/Domain/Privacy/PrivacyRepository';

describe('OptInSubcommand Integration Test', () => {
    let optInSubcommand: OptInSubcommand;
    let privacyRepository: PrivacyRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        optInSubcommand = myContainer.get<OptInSubcommand>(OptInSubcommand);
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

    test('replies ephemerally, in pt-PT, and clears a previous opt-out', async () => {
        const userId = '333333333333333333';
        await privacyRepository.setOptOut(userId, true);

        const interaction = new FakeInteraction({}, userId);
        await optInSubcommand.handle(buildContext(interaction));

        expect(interaction.replyCalls.length).toBe(1);
        expect(interaction.replyCalls[0].flags).toBe(MessageFlags.Ephemeral);
        expect(interaction.replyCalls[0].content).toContain('Voltaste a aparecer publicamente');

        expect(await privacyRepository.isOptedOut(userId)).toBe(false);
    });

    test('is a no-op (not an error) for a member who was never opted out', async () => {
        const userId = '444444444444444444';
        const interaction = new FakeInteraction({}, userId);

        await optInSubcommand.handle(buildContext(interaction));

        expect(interaction.replyCalls.length).toBe(1);
        expect(await privacyRepository.isOptedOut(userId)).toBe(false);
    });
});
