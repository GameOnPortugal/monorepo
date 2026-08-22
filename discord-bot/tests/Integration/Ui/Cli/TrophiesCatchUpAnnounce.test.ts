import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { TrophyRepository } from '../../../../src/Domain/Trophy/TrophyRepository';
import type Logger from '../../../../src/Application/Logger/Logger';
import { InMemoryGuildClient } from '../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import TrophiesCatchUpAnnounce, {
    parseCatchUpAnnounceArgs,
} from '../../../../src/Ui/Cli/TrophiesCatchUpAnnounce';
import { CommunityChannels } from '../../../../src/Domain/Community/CommunityChannels';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createTrophyProfile, createTrophy } from '../../../Helper/StaticFixtures';

/**
 * The one-off "the trophy hall is alive again" post. It mentions real people
 * in bulk exactly once, so the behaviour that actually matters here is the
 * safety rails: preview by default, and refuse rather than truncate when the
 * blast radius looks wrong.
 */
describe('TrophiesCatchUpAnnounce', () => {
    let trophyRepository: TrophyRepository;
    let guildClient: InMemoryGuildClient;
    let command: TrophiesCatchUpAnnounce;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        trophyRepository = myContainer.get<TrophyRepository>(TYPES.TrophyRepository);
        guildClient = new InMemoryGuildClient();
        command = new TrophiesCatchUpAnnounce(
            trophyRepository,
            guildClient,
            myContainer.get<Logger>(TYPES.Logger),
        );
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    async function seedMember(userId: string, psnProfile: string, points: number[]) {
        const profile = await createTrophyProfile(undefined, userId, psnProfile);
        for (const [index, value] of points.entries()) {
            await createTrophy(
                undefined,
                profile.id.toString(),
                `https://psnprofiles.com/trophies/${psnProfile}-${index}`,
                value,
                new Date('2025-06-15'),
            );
        }
    }

    describe('argument parsing', () => {
        test('previews by default — posting is opt-in', () => {
            expect(parseCatchUpAnnounceArgs([]).post).toBe(false);
            expect(parseCatchUpAnnounceArgs(['--post']).post).toBe(true);
        });

        test('accepts an explicit --since', () => {
            expect(
                parseCatchUpAnnounceArgs(['--since=2025-01-31']).since.toISOString().slice(0, 10),
            ).toBe('2025-01-31');
        });

        test('rejects a malformed date rather than silently scanning from the epoch', () => {
            expect(() => parseCatchUpAnnounceArgs(['--since=not-a-date'])).toThrow(
                /Invalid --since/,
            );
            expect(() => parseCatchUpAnnounceArgs(['--since=31-01-2025'])).toThrow(
                /Invalid --since/,
            );
        });

        test('rejects unknown arguments instead of ignoring them', () => {
            expect(() => parseCatchUpAnnounceArgs(['--yolo'])).toThrow(/Unknown argument/);
        });
    });

    test('posts one message per member, mentioning them with their totals', async () => {
        await seedMember('user-a', 'HunterA', [500, 250]);

        const exitCode = await command.run(['--since=2024-11-30', '--post']);

        expect(exitCode).toBe(0);
        expect(guildClient.sentMessages).toHaveLength(1);
        const sent = guildClient.sentMessages[0]!;
        expect(sent.channel).toBe(CommunityChannels.TROPHIES);
        expect(sent.message).toContain('<@user-a>');
        expect(sent.message).toContain('**2 troféus platina**');
        expect(sent.message).toContain('**750 TP**');
    });

    test('says "troféu" in the singular for a member with exactly one', async () => {
        await seedMember('user-solo', 'Solo', [800]);

        await command.run(['--since=2024-11-30', '--post']);

        expect(guildClient.sentMessages[0]!.message).toContain('**1 troféu platina**');
    });

    test('without --post it previews and sends nothing', async () => {
        await seedMember('user-a', 'HunterA', [500]);

        const exitCode = await command.run(['--since=2024-11-30']);

        expect(exitCode).toBe(0);
        expect(guildClient.sentMessages).toHaveLength(0);
    });

    test('refuses to post at all when more members match than --max', async () => {
        // A --since far enough back to sweep in everybody is the realistic
        // way to get this wrong, and posting "just the first few" would be
        // the worst outcome — so it must send nothing.
        await seedMember('user-a', 'A', [500]);
        await seedMember('user-b', 'B', [500]);
        await seedMember('user-c', 'C', [500]);

        const exitCode = await command.run(['--since=2024-11-30', '--max=2', '--post']);

        expect(exitCode).toBe(1);
        expect(guildClient.sentMessages).toHaveLength(0);
    });

    test('a failed send does not abandon the rest of the run', async () => {
        await seedMember('user-a', 'AAA', [2000]);
        await seedMember('user-b', 'BBB', [50]);
        guildClient.failNextSendWith = new Error('Discord is having a moment');

        const exitCode = await command.run(['--since=2024-11-30', '--post']);

        // Non-zero so an operator notices, but the second member still heard.
        expect(exitCode).toBe(1);
        expect(guildClient.sentMessages).toHaveLength(1);
        expect(guildClient.sentMessages[0]!.message).toContain('<@user-b>');
    });

    test('is a no-op when nothing was earned in the window', async () => {
        const profile = await createTrophyProfile(undefined, 'user-old', 'OldOnly');
        await createTrophy(
            undefined,
            profile.id.toString(),
            'https://psnprofiles.com/trophies/old',
            500,
            new Date('2024-01-01'),
        );

        const exitCode = await command.run(['--since=2024-11-30', '--post']);

        expect(exitCode).toBe(0);
        expect(guildClient.sentMessages).toHaveLength(0);
    });
});
