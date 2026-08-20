import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { createScreenshot } from '../../../../../Helper/StaticFixtures';
import { GetScreenshotWinner } from '../../../../../../src/Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinner';
import type { ScreenshotWinnerResult } from '../../../../../../src/Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinnerHandler';
import type { GuildClient } from '../../../../../../src/Domain/Community/GuildClient.ts';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import { CustomEmoji } from '../../../../../../src/Domain/Community/CustomEmoji.ts';

/**
 * M6.4: `GetScreenshotWinnerHandler` is exercised through the real DI
 * container. `TYPES.GuildClient` resolves to `InMemoryGuildClient` because
 * `DISCORD_TOKEN` is unset in the test environment (same rule the `Bot`
 * binding already follows) — so reactions/messages are seeded directly on
 * that fake, with no mocking library involved.
 */
describe('GetScreenshotWinnerHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    // A fixed Thursday reference so every test resolves the same, known
    // Monday->Sunday window regardless of when the suite actually runs.
    const weekReference = new Date('2026-01-15T15:00:00Z');

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('returns no winner and no candidates for a week with no screenshots', async () => {
        const result: ScreenshotWinnerResult = await commandHandlerManager.handle(
            new GetScreenshotWinner(weekReference),
        );

        expect(result.winner).toBeNull();
        expect(result.candidateCount).toBe(0);
        expect(result.skippedCount).toBe(0);
    });

    test('picks the screenshot with the most reactions', async () => {
        const loser = await createScreenshot(
            undefined,
            'Loser',
            '111111111111111111',
            undefined,
            'msg-loser',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-06T10:00:00Z'),
        );
        const winnerScreenshot = await createScreenshot(
            undefined,
            'Winner',
            '222222222222222222',
            undefined,
            'msg-winner',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-07T10:00:00Z'),
        );

        guildClient.registerMessage(loser.messageId as string, { [CustomEmoji.TROPHY_PLAT]: 2 });
        guildClient.registerMessage(winnerScreenshot.messageId as string, {
            [CustomEmoji.TROPHY_PLAT]: 5,
        });

        const result: ScreenshotWinnerResult = await commandHandlerManager.handle(
            new GetScreenshotWinner(weekReference),
        );

        expect(result.winner?.screenshot.id.toString()).toBe(winnerScreenshot.id.toString());
        expect(result.winner?.reactionCount).toBe(5);
        expect(result.candidateCount).toBe(2);
        expect(result.skippedCount).toBe(0);
    });

    test('ties resolve deterministically to the earliest submission, stable across runs', async () => {
        const postedFirst = await createScreenshot(
            undefined,
            'Posted first',
            '111111111111111111',
            undefined,
            'msg-first',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-06T09:00:00Z'),
        );
        const postedSecond = await createScreenshot(
            undefined,
            'Posted second',
            '222222222222222222',
            undefined,
            'msg-second',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-07T09:00:00Z'),
        );

        guildClient.registerMessage(postedFirst.messageId as string, {
            [CustomEmoji.TROPHY_PLAT]: 3,
        });
        guildClient.registerMessage(postedSecond.messageId as string, {
            [CustomEmoji.TROPHY_PLAT]: 3,
        });

        const runOnce = await commandHandlerManager.handle(new GetScreenshotWinner(weekReference));
        const runTwice = await commandHandlerManager.handle(new GetScreenshotWinner(weekReference));

        expect(runOnce.winner?.screenshot.id.toString()).toBe(postedFirst.id.toString());
        expect(runTwice.winner?.screenshot.id.toString()).toBe(postedFirst.id.toString());
    });

    test('skips a screenshot whose message has vanished, in favour of the next candidate', async () => {
        const vanished = await createScreenshot(
            undefined,
            'Vanished',
            '111111111111111111',
            undefined,
            'msg-vanished',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-06T09:00:00Z'),
        );
        const stillThere = await createScreenshot(
            undefined,
            'Still there',
            '222222222222222222',
            undefined,
            'msg-still-there',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-07T09:00:00Z'),
        );

        // The `vanished` screenshot's message is never registered on the fake
        // — getTotalReactionsByEmoji throws exactly as DiscordGuildClient
        // would for a message deleted by its author, a moderator, or Discord.
        expect(vanished.messageId).toBe('msg-vanished');
        guildClient.registerMessage(stillThere.messageId as string, {
            [CustomEmoji.TROPHY_PLAT]: 1,
        });

        const result: ScreenshotWinnerResult = await commandHandlerManager.handle(
            new GetScreenshotWinner(weekReference),
        );

        expect(result.winner?.screenshot.id.toString()).toBe(stillThere.id.toString());
        expect(result.candidateCount).toBe(2);
        expect(result.skippedCount).toBe(1);
    });

    test('a week where every candidate has vanished has no winner, but does not throw', async () => {
        await createScreenshot(
            undefined,
            'Vanished',
            '111111111111111111',
            undefined,
            'msg-all-vanished',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-06T09:00:00Z'),
        );

        const result: ScreenshotWinnerResult = await commandHandlerManager.handle(
            new GetScreenshotWinner(weekReference),
        );

        expect(result.winner).toBeNull();
        expect(result.candidateCount).toBe(1);
        expect(result.skippedCount).toBe(1);
    });
});
