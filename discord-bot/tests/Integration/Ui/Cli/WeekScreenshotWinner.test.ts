import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createScreenshot } from '../../../Helper/StaticFixtures';
import type { GuildClient } from '../../../../src/Domain/Community/GuildClient.ts';
import { InMemoryGuildClient } from '../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import { CustomEmoji } from '../../../../src/Domain/Community/CustomEmoji.ts';
import { CommunityChannels } from '../../../../src/Domain/Community/CommunityChannels.ts';
import WeekScreenshotWinner, {
    parseWeekScreenshotWinnerArgs,
} from '../../../../src/Ui/Cli/WeekScreenshotWinner.ts';

describe('parseWeekScreenshotWinnerArgs', () => {
    test('defaults to now and public mode with no arguments', () => {
        const before = Date.now();
        const args = parseWeekScreenshotWinnerArgs([]);
        const after = Date.now();

        expect(args.mode).toBe('public');
        expect(args.date.getTime()).toBeGreaterThanOrEqual(before);
        expect(args.date.getTime()).toBeLessThanOrEqual(after);
    });

    test('reads the flag form: --date and --dry-run', () => {
        const args = parseWeekScreenshotWinnerArgs(['--date=2026-01-15T15:00:00Z', '--dry-run']);

        expect(args.date.toISOString()).toBe('2026-01-15T15:00:00.000Z');
        expect(args.mode).toBe('dry-run');
    });

    test('still honours the legacy positional form: [date, "true"|"false"]', () => {
        const dryRun = parseWeekScreenshotWinnerArgs(['2026-01-15T15:00:00Z', 'true']);
        expect(dryRun.date.toISOString()).toBe('2026-01-15T15:00:00.000Z');
        expect(dryRun.mode).toBe('dry-run');

        const publicRun = parseWeekScreenshotWinnerArgs(['2026-01-15T15:00:00Z', 'false']);
        expect(publicRun.mode).toBe('public');
    });

    test('rejects an invalid date rather than silently producing "Invalid Date"', () => {
        expect(() => parseWeekScreenshotWinnerArgs(['not-a-date'])).toThrow();
    });
});

describe('WeekScreenshotWinner Integration Test', () => {
    let command: WeekScreenshotWinner;
    let guildClient: InMemoryGuildClient;
    let ormClient: PrismaClient;

    // Same fixed Thursday reference as GetScreenshotWinnerHandler.test.ts,
    // resolving to the Monday 2026-01-05 -> Sunday 2026-01-11 window.
    const weekReferenceArg = '2026-01-15T15:00:00Z';

    beforeEach(async () => {
        command = myContainer.get<WeekScreenshotWinner>(WeekScreenshotWinner);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    async function seedWinner(): Promise<{ authorId: string; reactionCount: number }> {
        const authorId = '999988887777666655';
        const screenshot = await createScreenshot(
            undefined,
            'Winning shot',
            authorId,
            undefined,
            'msg-the-winner',
            undefined,
            undefined,
            undefined,
            new Date('2026-01-08T10:00:00Z'),
        );
        guildClient.registerMessage(screenshot.messageId as string, {
            [CustomEmoji.TROPHY_PLAT]: 7,
        });

        return { authorId, reactionCount: 7 };
    }

    test('a week with no screenshots exits cleanly without sending anything', async () => {
        const exitCode = await command.run([weekReferenceArg]);

        expect(exitCode).toBe(0);
        expect(guildClient.sentMessages).toHaveLength(0);
    });

    test('public mode announces the winner and the contest banner in pt-PT, and never sends !give-xp', async () => {
        const { authorId, reactionCount } = await seedWinner();

        const exitCode = await command.run([weekReferenceArg]);

        expect(exitCode).toBe(0);
        expect(
            guildClient.sentMessages.every(
                (sent) => sent.channel === CommunityChannels.SCREENSHOTS,
            ),
        ).toBe(true);
        expect(guildClient.sentMessages.some((sent) => sent.message.includes('!give-xp'))).toBe(
            false,
        );

        const announcement = guildClient.sentMessages[0]?.message ?? '';
        expect(announcement).toContain('🏆 Screenshot da Semana!');
        expect(announcement).toContain(`Parabéns, <@${authorId}>!`);
        expect(announcement).toContain(`${reactionCount} reações`);
        expect(announcement).not.toMatch(/Congratulations|reactions|Check it out/);

        const banner = guildClient.sentMessages[1]?.message ?? '';
        expect(banner).toContain('Concurso');
        expect(banner).toContain('ABERTO');
        expect(banner).toContain('12/01'); // the Monday opening the next contest
    });

    test('dry-run mode reports to the admin channel only — nothing public, no !give-xp', async () => {
        await seedWinner();

        const exitCode = await command.run(['--date=' + weekReferenceArg, '--dry-run']);

        expect(exitCode).toBe(0);
        expect(guildClient.sentMessages).toHaveLength(1);
        expect(guildClient.sentMessages[0]?.channel).toBe(CommunityChannels.ADMIN);
        expect(
            guildClient.sentMessages.some((sent) => sent.channel === CommunityChannels.SCREENSHOTS),
        ).toBe(false);
        expect(guildClient.sentMessages.some((sent) => sent.message.includes('!give-xp'))).toBe(
            false,
        );

        const report = guildClient.sentMessages[0]?.message ?? '';
        expect(report).toContain('DRY RUN');
        expect(report).toContain('nothing was posted publicly');
    });

    test('legacy positional dry-run flag still works end to end', async () => {
        await seedWinner();

        const exitCode = await command.run([weekReferenceArg, 'true']);

        expect(exitCode).toBe(0);
        expect(guildClient.sentMessages).toHaveLength(1);
        expect(guildClient.sentMessages[0]?.channel).toBe(CommunityChannels.ADMIN);
    });
});
