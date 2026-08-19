import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { SellSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/SellSubcommand';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import { PrismaClient } from '@prisma/client';
import type { AdRepository } from '../../../../../../../src/Domain/Marketplace/AdRepository';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

describe('SellSubcommand Integration Test', () => {
    let sellSubcommand: SellSubcommand;
    let adRepository: AdRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        sellSubcommand = myContainer.get<SellSubcommand>(SellSubcommand);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function buildContext(interaction: FakeInteraction): SlashCommandContext {
        return {
            channel_id: interaction.channelId,
            command: 'marketplace',
            text: '',
            interaction,
        };
    }

    const sellOptions = {
        name: 'PS5 DualSense Controller',
        price: '50€',
        state: 'new',
        zone: 'Porto',
        dispatch: 'included',
    };

    it('posts exactly one message and performs exactly one write, persisting the real message id', async () => {
        const userId = '123456789012345678';
        const interaction = new FakeInteraction(sellOptions, userId);

        await sellSubcommand.handle(buildContext(interaction));

        // Exactly one message posted.
        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.followUpCalls.length).toBe(0);
        expect(interaction.replyCalls.length).toBe(0);

        // Exactly one ad persisted...
        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(1);
        const [ad] = ads;
        if (!ad) throw new Error('expected an ad to have been persisted');

        // ...and the message_id it holds is non-empty and matches the message
        // that was actually posted, not a placeholder or an interaction id.
        // This is the assertion that would have caught all 28 of the
        // production rows created with message_id = ''.
        expect(ad.messageId).not.toBe('');
        expect(ad.messageId).not.toBeNull();
        expect(ad.messageId).toBe('fake-message-1');
    });

    it('does not leave a half-written ad row when posting the message fails', async () => {
        const userId = '987654321098765432';
        const interaction = new FakeInteraction(sellOptions, userId);
        interaction.failNextEditReplyWith = new Error('simulated Discord API failure');

        await sellSubcommand.handle(buildContext(interaction));

        // The failed post attempt was made, and the user was told about it
        // without leaking the raw error...
        expect(interaction.editReplyCalls.length).toBe(2);
        const errorReply = interaction.editReplyCalls[1];
        expect(errorReply.content).not.toContain('simulated Discord API failure');
        expect(errorReply.content).toContain('ref:');

        // ...but no ad row was ever written.
        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(0);
    });

    it('tells the user without leaking internals when the message posts but the write fails', async () => {
        const userId = '111122223333444455';
        // `name` is VARCHAR(191) at the database (prisma/migrations/20250416170150_init).
        // A value past that limit makes the write deterministically fail after
        // the message has already been posted, without needing a mocking
        // library or a flaky connection trick.
        const interaction = new FakeInteraction({ ...sellOptions, name: 'x'.repeat(500) }, userId);

        await sellSubcommand.handle(buildContext(interaction));

        // Exactly one message was posted...
        expect(interaction.editReplyCalls.length).toBe(1);
        // ...the user was told via an ephemeral follow-up, not a second reply,
        // and the message does not leak the raw database error...
        expect(interaction.followUpCalls.length).toBe(1);
        const followUp = interaction.followUpCalls[0];
        expect(followUp.content).toContain('ref:');
        expect(followUp.content.toLowerCase()).not.toContain('prisma');
        expect(followUp.content.toLowerCase()).not.toContain('data too long');

        // ...and no ad row exists for the failed write.
        const ads = await adRepository.findByUserId(userId);
        expect(ads.length).toBe(0);
    });
});
