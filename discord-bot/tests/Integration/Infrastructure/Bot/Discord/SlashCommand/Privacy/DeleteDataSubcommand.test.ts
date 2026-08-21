import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { MessageFlags } from 'discord.js';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { DeleteDataSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Privacy/DeleteDataSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

describe('DeleteDataSubcommand Integration Test', () => {
    let deleteDataSubcommand: DeleteDataSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        deleteDataSubcommand = myContainer.get<DeleteDataSubcommand>(DeleteDataSubcommand);
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

    test('without the exact confirmation phrase: refuses with a plain (undeferred) ephemeral reply and deletes nothing', async () => {
        const userId = '111111111111111111';
        await ormClient.ad.create({
            data: { id: 'ad-safe', author_id: userId, name: 'Should survive', status: 'active' },
        });

        const interaction = new FakeInteraction({ confirmar: 'apagar' }, userId);
        await deleteDataSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(0);
        expect(interaction.replyCalls.length).toBe(1);
        expect(interaction.replyCalls[0].flags).toBe(MessageFlags.Ephemeral);
        expect(interaction.replyCalls[0].content).toContain('APAGAR');

        expect(await ormClient.ad.findUnique({ where: { id: 'ad-safe' } })).not.toBeNull();
    });

    test('with the exact confirmation phrase: defers, then hard-erases and reports counts in the edited reply', async () => {
        const userId = '222222222222222222';
        await ormClient.ad.create({
            data: { id: 'ad-to-erase', author_id: userId, name: 'Bye', status: 'active' },
        });
        await ormClient.screenshot.create({
            data: { id: 'shot-to-erase', author_id: userId, name: 'Bye shot' },
        });
        await ormClient.trophyProfile.create({
            data: { id: crypto.randomUUID(), userId, psnProfile: 'BinnedPsn' },
        });
        expect(await ormClient.trophyProfile.findFirst({ where: { userId } })).not.toBeNull();

        const interaction = new FakeInteraction({ confirmar: 'APAGAR' }, userId);
        await deleteDataSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toContain('1 anúncio');
        expect(interaction.editReplyCalls[0].content).toContain('1 screenshot');
        expect(interaction.editReplyCalls[0].content).toContain('perfil de troféus');

        expect(await ormClient.ad.findUnique({ where: { id: 'ad-to-erase' } })).toBeNull();
        expect(
            await ormClient.screenshot.findUnique({ where: { id: 'shot-to-erase' } }),
        ).toBeNull();
        expect(await ormClient.trophyProfile.findFirst({ where: { userId } })).toBeNull();
    });
});
