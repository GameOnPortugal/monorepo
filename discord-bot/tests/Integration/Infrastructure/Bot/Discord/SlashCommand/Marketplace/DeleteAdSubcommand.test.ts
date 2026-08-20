import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { DeleteAdSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/DeleteAdSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { createAd } from '../../../../../../Helper/StaticFixtures';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';

describe('DeleteAdSubcommand Integration Test', () => {
    let deleteAdSubcommand: DeleteAdSubcommand;
    let adRepository: AdRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        deleteAdSubcommand = myContainer.get<DeleteAdSubcommand>(DeleteAdSubcommand);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
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

    it('defers before doing any work, then edits the deferred reply', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId);
        const interaction = new FakeInteraction({ id: ad.id.toString() }, userId);

        await deleteAdSubcommand.handle(buildContext(interaction));

        // Deferred first (M4.2): the lookup for a numeric position requires a
        // ListUserAds query before the delete itself, which can be slower
        // than the 3s ack window. No bare `.reply()` should be used once the
        // command has deferred.
        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.deferReplyCalls[0]).toEqual({ flags: MessageFlags.Ephemeral });
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toBe('🗑️ Anúncio apagado com sucesso.');
        await expect(adRepository.get(ad.id)).rejects.toThrow();
    });

    it('does not leak the raw error when deletion fails for an unmapped reason', async () => {
        // `adRepository` is bound in singleton scope, so patching the instance
        // the test holds also affects the one injected into DeleteAdHandler.
        // This simulates an unmapped failure (e.g. a dropped DB connection)
        // without a mocking library — the exact branch that used to forward
        // `error.message` straight to the user (DeleteAdSubcommand.ts:59).
        const userId = '123456789012345678';
        const ad = await createAd(undefined, 'Test Ad', userId);

        const realDelete = adRepository.delete.bind(adRepository);
        adRepository.delete = async () => {
            throw new Error('ECONNRESET: secret internal connection string leaked here');
        };

        try {
            const interaction = new FakeInteraction({ id: ad.id.toString() }, userId);
            await deleteAdSubcommand.handle(buildContext(interaction));

            expect(interaction.editReplyCalls.length).toBe(1);
            const reply = interaction.editReplyCalls[0];
            expect(reply.content).not.toContain('ECONNRESET');
            expect(reply.content).not.toContain('secret internal connection string');
            expect(reply.content).toContain('ref:');
        } finally {
            adRepository.delete = realDelete;
        }
    });

    it('refuses deletion by a non-owner without leaking internals', async () => {
        const ownerId = '123456789012345678';
        const otherUserId = '987654321098765432';
        const ad = await createAd(undefined, 'Test Ad', ownerId);
        const interaction = new FakeInteraction({ id: ad.id.toString() }, otherUserId);

        await deleteAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toBe(
            'Não tens permissão para apagar este anúncio.',
        );
        // The ad still exists.
        await expect(adRepository.get(ad.id)).resolves.toBeDefined();
    });

    it('reports a clean message when the ad does not exist', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(
            { id: '00000000-0000-0000-0000-000000000000' },
            userId,
        );

        await deleteAdSubcommand.handle(buildContext(interaction));

        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].content).toBe('Anúncio não encontrado.');
    });
});
