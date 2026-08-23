import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { RecordWeeklyWinner } from '../../../../../../src/Application/Write/Screenshot/RecordWeeklyWinner/RecordWeeklyWinner.ts';
import type { WeeklyWinnerRepository } from '../../../../../../src/Domain/Screenshot/WeeklyWinnerRepository.ts';

const WEEK_START = new Date('2026-01-05T00:00:00.000Z');
const WEEK_END = new Date('2026-01-11T23:59:59.999Z');

describe('RecordWeeklyWinnerHandler', () => {
    let commandHandlerManager: CommandHandlerManager;
    let repository: WeeklyWinnerRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        await DatabaseUtil.truncateAllTables();
        commandHandlerManager = myContainer.get(CommandHandlerManager);
        repository = myContainer.get<WeeklyWinnerRepository>(TYPES.WeeklyWinnerRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function record(
        screenshotId: string,
        source: 'announced' | 'inferred',
        voteCount: number | null = 7,
    ) {
        return commandHandlerManager.handle(
            new RecordWeeklyWinner(
                screenshotId,
                '999988887777666655',
                WEEK_START,
                WEEK_END,
                voteCount,
                'https://discord.com/channels/1/2/3',
                null,
                source,
            ),
        );
    }

    test('records a week', async () => {
        await record('shot-1', 'announced');

        const stored = await repository.findByWeekStart(WEEK_START);
        expect(stored?.screenshotId).toBe('shot-1');
        expect(stored?.source).toBe('announced');
        expect(stored?.voteCount).toBe(7);
    });

    test('re-recording the same week updates it rather than adding a second one', async () => {
        await record('shot-1', 'announced');
        await record('shot-2', 'announced');

        expect(await repository.findAll()).toHaveLength(1);
        expect((await repository.findByWeekStart(WEEK_START))?.screenshotId).toBe('shot-2');
    });

    test('an inferred row never overwrites an announced one', async () => {
        // The backfill parses the very announcements the live job posted, so
        // running it after a few normal weeks must not downgrade rows the bot
        // wrote first-hand — the portal's "inferred" disclaimer would then be
        // lying about data it actually has.
        await record('the-real-winner', 'announced');
        await record('a-misparse', 'inferred');

        const stored = await repository.findByWeekStart(WEEK_START);
        expect(stored?.screenshotId).toBe('the-real-winner');
        expect(stored?.source).toBe('announced');
    });

    test('an announced row does upgrade an inferred one', async () => {
        await record('recovered-from-history', 'inferred');
        await record('announced-live', 'announced');

        const stored = await repository.findByWeekStart(WEEK_START);
        expect(stored?.screenshotId).toBe('announced-live');
        expect(stored?.source).toBe('announced');
    });

    test('a null vote count is stored as unknown, never as zero', async () => {
        // The old bot's announcements never stated a count; claiming "0
        // reações" for a week that was genuinely won would be a lie the
        // portal would then render.
        await record('shot-1', 'inferred', null);

        expect((await repository.findByWeekStart(WEEK_START))?.voteCount).toBeNull();
    });
});
