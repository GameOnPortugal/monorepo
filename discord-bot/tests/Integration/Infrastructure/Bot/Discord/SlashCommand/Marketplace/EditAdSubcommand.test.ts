import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { EditAdSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/EditAdSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import { buildCustomId } from '../../../../../../../src/Domain/Bot/CustomId';

describe('EditAdSubcommand Integration Test (M5.6)', () => {
    let editAdSubcommand: EditAdSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        editAdSubcommand = myContainer.get<EditAdSubcommand>(EditAdSubcommand);
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
            command: 'marketplace',
            text: '',
            interaction: interaction.asChatInputCommandInteraction(),
        };
    }

    it('opens a modal pre-filled with the current price/description, addressed to mkt:edit-submit:<adId>', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(
            undefined, // id
            'Test Ad', // name
            userId, // authorId
            undefined, // channelId
            undefined, // messageId
            undefined, // state
            '60€', // price
            undefined, // zone
            undefined, // dispatch
            undefined, // warranty
            'Old description', // description
        );
        const interaction = new FakeInteraction({ id: ad.id.toString() }, userId);

        await editAdSubcommand.handle(buildContext(interaction));

        expect(interaction.showModalCalls.length).toBe(1);
        const modal = interaction.showModalCalls[0];
        const modalJson = modal.toJSON();
        expect(modalJson.custom_id).toBe(buildCustomId('mkt', 'edit-submit', ad.id.toString()));

        const priceInput = modalJson.components[0].components[0];
        const descriptionInput = modalJson.components[1].components[0];
        expect(priceInput.value).toBe('60€');
        expect(descriptionInput.value).toBe('Old description');
    });

    it('refuses a non-owner without opening the modal', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);
        const interaction = new FakeInteraction({ id: ad.id.toString() }, otherUserId);

        await editAdSubcommand.handle(buildContext(interaction));

        expect(interaction.showModalCalls.length).toBe(0);
        expect(interaction.replyCalls[0].content).toContain('Não tens permissão');
    });

    it('reports a clean message when the ad does not exist', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(
            { id: '00000000-0000-0000-0000-000000000000' },
            userId,
        );

        await editAdSubcommand.handle(buildContext(interaction));

        expect(interaction.showModalCalls.length).toBe(0);
        expect(interaction.replyCalls[0].content).toBe('Anúncio não encontrado.');
    });
});
