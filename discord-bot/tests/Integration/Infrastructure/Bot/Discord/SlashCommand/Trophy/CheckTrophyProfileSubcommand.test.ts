import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../../src/Infrastructure/DependencyInjection/types';
import { CheckTrophyProfileSubcommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Trophy/CheckTrophyProfileSubcommand';
import CommandHandlerManager from '../../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import DatabaseUtil from '../../../../../../Helper/DatabaseUtil';
import FakeInteraction from '../../../../../../Helper/FakeInteraction';
import FakeTrophySource from '../../../../../../Helper/FakeTrophySource';
import { createTrophyProfile } from '../../../../../../Helper/StaticFixtures';
import { MessageFlags } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import type Logger from '../../../../../../../src/Application/Logger/Logger';
import type { SlashCommandContext } from '../../../../../../../src/Domain/Bot/SlashCommandContext';

/**
 * M4.2 coverage: `CheckTrophyProfileSubcommand` was one of the worst
 * offenders with no `deferReply()` at all — `GetProfile` is a database read
 * that can outrun the 3s interaction-ack window.
 *
 * M7.4 coverage: the live world/national rank lookup, and the banned/left
 * specific messages. Built by hand with a `FakeTrophySource` instead of
 * resolved from `myContainer` — the container binds the real,
 * network-touching `PsnProfilesTrophySource` to `TYPES.TrophySource`, and no
 * test in this repo may hit the network or real PSNProfiles.
 */
describe('CheckTrophyProfileSubcommand Integration Test', () => {
    let fakeTrophySource: FakeTrophySource;
    let checkTrophyProfileSubcommand: CheckTrophyProfileSubcommand;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        fakeTrophySource = new FakeTrophySource();
        checkTrophyProfileSubcommand = new CheckTrophyProfileSubcommand(
            myContainer.get<Logger>(TYPES.Logger),
            myContainer.get<CommandHandlerManager>(CommandHandlerManager),
            fakeTrophySource,
        );
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
            command: 'trophy',
            text: '',
            interaction: interaction.asChatInputCommandInteraction(),
        };
    }

    it('defers before querying, then edits the deferred reply with the profile embed and a live rank', async () => {
        const userId = '123456789012345678';
        await createTrophyProfile(undefined, userId, 'SomePsnUser');
        fakeTrophySource.setRank('SomePsnUser', { worldRank: 4242, countryRank: 12 });

        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.replyCalls.length).toBe(0);
        expect(interaction.editReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls[0].embeds).toHaveLength(1);
        expect(fakeTrophySource.rankRequests).toEqual(['SomePsnUser']);

        const embedJson = interaction.editReplyCalls[0].embeds[0].toJSON();
        const rankField = embedJson.fields.find(
            (field: { name: string }) => field.name === '🏆 Rank',
        );
        expect(rankField.value).toContain('4242');
        expect(rankField.value).toContain('12');
    });

    it('does not call the live TrophySource for a banned profile, and shows a banned message', async () => {
        const userId = '111111111111111111';
        await createTrophyProfile(undefined, userId, 'BannedPsnUser', true, false, false);

        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(fakeTrophySource.rankRequests).toEqual([]);
        const embedJson = interaction.editReplyCalls[0].embeds[0].toJSON();
        const rankField = embedJson.fields.find(
            (field: { name: string }) => field.name === '🏆 Rank',
        );
        expect(rankField.value).toContain('banido');
    });

    it('does not call the live TrophySource for a profile that has left, and shows a left message', async () => {
        const userId = '222222222222222222';
        await createTrophyProfile(undefined, userId, 'LeftPsnUser', false, true, false);

        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        expect(fakeTrophySource.rankRequests).toEqual([]);
        const embedJson = interaction.editReplyCalls[0].embeds[0].toJSON();
        const rankField = embedJson.fields.find(
            (field: { name: string }) => field.name === '🏆 Rank',
        );
        expect(rankField.value).toContain('já não está no servidor');
    });

    it('degrades gracefully when the live TrophySource lookup throws', async () => {
        const userId = '333333333333333333';
        await createTrophyProfile(undefined, userId, 'FlakyPsnUser');
        fakeTrophySource.setRank('FlakyPsnUser', { worldRank: 1, countryRank: 1 });
        const originalGetProfileRank = fakeTrophySource.getProfileRank.bind(fakeTrophySource);
        fakeTrophySource.getProfileRank = async () => {
            throw new Error('PSNProfiles is down');
        };

        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        // Still replies successfully — a live-rank failure must not fail
        // the whole command.
        expect(interaction.editReplyCalls.length).toBe(1);
        const embedJson = interaction.editReplyCalls[0].embeds[0].toJSON();
        const rankField = embedJson.fields.find(
            (field: { name: string }) => field.name === '🏆 Rank',
        );
        expect(rankField.value).toContain('Não foi possível obter o rank');

        // restore, not that it matters after the assertions above
        fakeTrophySource.getProfileRank = originalGetProfileRank;
    });

    it('defers publicly, but the not-found path deletes the public placeholder and follows up ephemerally (M0.3)', async () => {
        const userId = '987654321098765432';
        const interaction = new FakeInteraction({}, userId);

        await checkTrophyProfileSubcommand.handle(buildContext(interaction));

        // The defer itself is public (no flags) — the success path is meant
        // to be visible.
        expect(interaction.deferReplyCalls.length).toBe(1);
        expect(interaction.deferReplyCalls[0]).toBeUndefined();

        // But the not-found outcome must not leave that public "thinking..."
        // placeholder standing: it is deleted, and a fresh ephemeral
        // followUp carries the message instead. This is the exact pattern
        // M0.3 required — regressing to a bare editReply() here would post
        // the not-found message publicly again.
        expect(interaction.deleteReplyCalls.length).toBe(1);
        expect(interaction.editReplyCalls.length).toBe(0);
        expect(interaction.followUpCalls.length).toBe(1);
        expect(interaction.followUpCalls[0].content).toContain(
            'Ainda não registaste o teu perfil PSN',
        );
        expect(interaction.followUpCalls[0].flags).toBe(MessageFlags.Ephemeral);
        // No profile means no live-rank lookup either.
        expect(fakeTrophySource.rankRequests).toEqual([]);
    });
});
