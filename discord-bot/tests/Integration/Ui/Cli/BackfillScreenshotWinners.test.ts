import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createScreenshot } from '../../../Helper/StaticFixtures';
import type { GuildClient } from '../../../../src/Domain/Community/GuildClient.ts';
import { InMemoryGuildClient } from '../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import BackfillScreenshotWinners, {
    parseBackfillWinnersArgs,
} from '../../../../src/Ui/Cli/BackfillScreenshotWinners.ts';
import type { WeeklyWinnerRepository } from '../../../../src/Domain/Screenshot/WeeklyWinnerRepository.ts';

describe('parseBackfillWinnersArgs', () => {
    test('is dry by default — this writes community history, so seeing it first is the point', () => {
        expect(parseBackfillWinnersArgs([]).apply).toBe(false);
    });

    test('--apply opts into the writes', () => {
        expect(parseBackfillWinnersArgs(['--apply']).apply).toBe(true);
    });

    test('--max-pages bounds the scan', () => {
        expect(parseBackfillWinnersArgs(['--max-pages=3']).maxPages).toBe(3);
    });

    test('rejects an unknown argument rather than silently ignoring it', () => {
        expect(() => parseBackfillWinnersArgs(['--aply'])).toThrow();
    });
});

describe('BackfillScreenshotWinners Integration Test', () => {
    let command: BackfillScreenshotWinners;
    let guildClient: InMemoryGuildClient;
    let winners: WeeklyWinnerRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        command = myContainer.get<BackfillScreenshotWinners>(BackfillScreenshotWinners);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;
        winners = myContainer.get<WeeklyWinnerRepository>(TYPES.WeeklyWinnerRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    /**
     * A winning screenshot plus the announcement that named it, in the shape
     * the channel actually holds them: the announcement links the *winning
     * message*, and `screenshots.message_id` is what maps that back to a row.
     */
    async function seedAnnouncedWinner(options: {
        messageId: string;
        postedAt: Date;
        name: string;
        announcement: string;
        authorIsBot?: boolean;
    }): Promise<void> {
        await createScreenshot(
            undefined,
            options.name,
            '999988887777666655',
            undefined,
            options.messageId,
            undefined,
            undefined,
            undefined,
            options.postedAt,
        );
        guildClient.registerMessage(options.messageId, {});
        guildClient.registerMessage(
            `announcement-for-${options.messageId}`,
            {},
            {
                content: options.announcement,
                ...(options.authorIsBot === undefined ? {} : { authorIsBot: options.authorIsBot }),
            },
        );
    }

    const oldFormat = (messageId: string) =>
        `Parabéns <@999988887777666655> ganhaste o screenshot da semana com Elden Ring. ` +
        `Plataforma: playstation.\n\nhttps://discord.com/channels/1/2/${messageId}`;

    const currentFormat = (messageId: string, votes: number) =>
        `🏆 Screenshot da Semana!\n\nParabéns, <@999988887777666655>! O teu screenshot foi o mais ` +
        `votado desta semana, com ${votes} reações. 🎉\n\n` +
        `Podes vê-lo aqui: https://discord.com/channels/1/2/${messageId}`;

    test('a dry run writes nothing', async () => {
        await seedAnnouncedWinner({
            messageId: '1000000000000000001',
            postedAt: new Date('2026-01-08T10:00:00Z'), // Thursday of the Mon 05 -> Sun 11 week
            name: 'Elden Ring',
            announcement: currentFormat('1000000000000000001', 7),
        });

        expect(await command.run([])).toBe(0);
        expect(await winners.findAll()).toHaveLength(0);
    });

    test('--apply records the week the winning screenshot was posted in, with its announced votes', async () => {
        await seedAnnouncedWinner({
            messageId: '1000000000000000001',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            name: 'Elden Ring',
            announcement: currentFormat('1000000000000000001', 7),
        });

        expect(await command.run(['--apply'])).toBe(0);

        const [winner] = await winners.findAll();
        expect(winner?.voteCount).toBe(7);
        expect(winner?.source).toBe('inferred');
        expect(winner?.authorId).toBe('999988887777666655');
        // The week the screenshot belongs to, not the week the announcement
        // happened to be scanned in — see weekWindowContaining().
        expect(winner?.weekStart.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    });

    test("recovers the old bot's format too, with no vote count rather than a made-up one", async () => {
        await seedAnnouncedWinner({
            messageId: '1000000000000000002',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            name: 'God of War',
            announcement: oldFormat('1000000000000000002'),
        });

        await command.run(['--apply']);

        const [winner] = await winners.findAll();
        expect(winner?.voteCount).toBeNull();
    });

    test('ignores an announcement quoted by a member — only the bot decides a contest', async () => {
        await seedAnnouncedWinner({
            messageId: '1000000000000000003',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            name: 'Bloodborne',
            announcement: currentFormat('1000000000000000003', 12),
            authorIsBot: false,
        });

        await command.run(['--apply']);

        expect(await winners.findAll()).toHaveLength(0);
    });

    test('an announcement whose screenshot row is gone is reported, not recorded', async () => {
        // No screenshot seeded — the announcement survives, the row does not
        // (deleted by its author, or by the GDPR erasure command).
        guildClient.registerMessage(
            'orphan-announcement',
            {},
            {
                content: currentFormat('1000000000000000009', 4),
            },
        );

        expect(await command.run(['--apply'])).toBe(0);
        expect(await winners.findAll()).toHaveLength(0);
    });

    test('is idempotent — a second run updates the same week instead of duplicating it', async () => {
        await seedAnnouncedWinner({
            messageId: '1000000000000000001',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            name: 'Elden Ring',
            announcement: currentFormat('1000000000000000001', 7),
        });

        await command.run(['--apply']);
        await command.run(['--apply']);

        expect(await winners.findAll()).toHaveLength(1);
    });

    test('records each week separately when several were announced', async () => {
        await seedAnnouncedWinner({
            messageId: '1000000000000000004',
            postedAt: new Date('2026-01-08T10:00:00Z'), // Mon 05 -> Sun 11
            name: 'Week one',
            announcement: currentFormat('1000000000000000004', 7),
        });
        await seedAnnouncedWinner({
            messageId: '1000000000000000005',
            postedAt: new Date('2026-01-15T10:00:00Z'), // Mon 12 -> Sun 18
            name: 'Week two',
            announcement: currentFormat('1000000000000000005', 9),
        });

        await command.run(['--apply']);

        const all = await winners.findAll();
        expect(all).toHaveLength(2);
        // findAll is newest-first.
        expect(all[0]?.weekStart.toISOString()).toBe('2026-01-12T00:00:00.000Z');
        expect(all[1]?.weekStart.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    });
});
