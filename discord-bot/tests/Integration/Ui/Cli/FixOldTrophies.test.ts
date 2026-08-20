import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { TrophyRepository } from '../../../../src/Domain/Trophy/TrophyRepository';
import type Logger from '../../../../src/Application/Logger/Logger';
import FixOldTrophies from '../../../../src/Ui/Cli/FixOldTrophies';
import { Trophy } from '../../../../src/Domain/Trophy/Trophy';
import { TrophyId } from '../../../../src/Domain/Trophy/TrophyId';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createTrophyProfile } from '../../../Helper/StaticFixtures';
import FakeTrophySource from '../../../Helper/FakeTrophySource';

/**
 * M7.7 — `trophies:fix-old` backfills a null `completionDate` by re-fetching
 * the trophy's page. Built by hand with a `FakeTrophySource` (no test may
 * hit the network or real PSNProfiles) and the real, DB-backed
 * `TrophyRepository` from the container.
 */
describe('FixOldTrophies', () => {
    let trophyRepository: TrophyRepository;
    let fakeTrophySource: FakeTrophySource;
    let command: FixOldTrophies;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        trophyRepository = myContainer.get<TrophyRepository>(TYPES.TrophyRepository);
        fakeTrophySource = new FakeTrophySource();
        command = new FixOldTrophies(
            trophyRepository,
            fakeTrophySource,
            myContainer.get<Logger>(TYPES.Logger),
        );
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    async function trophyMissingCompletionDate(profileId: string, url: string): Promise<Trophy> {
        const trophy = new Trophy(
            TrophyId.generate(),
            profileId,
            url,
            null,
            null,
            new Date(),
            new Date(),
        );
        await trophyRepository.save(trophy);
        return trophy;
    }

    test('backfills completionDate for rows missing one', async () => {
        const profile = await createTrophyProfile(undefined, 'user-1', 'Profile1');
        const url = 'https://psnprofiles.com/trophies/1-game/Profile1';
        await trophyMissingCompletionDate(profile.id.toString(), url);
        const completionDate = new Date('2021-06-29T00:00:00.000Z');
        fakeTrophySource.setTrophyData(url, { percentage: 12.3, completionDate });

        const exitCode = await command.run([]);

        expect(exitCode).toBe(0);
        const [fixed] = await trophyRepository.findByProfile(profile.id.toString());
        expect(fixed?.completionDate?.toISOString()).toBe(completionDate.toISOString());
    });

    test('--dry-run writes nothing', async () => {
        const profile = await createTrophyProfile(undefined, 'user-2', 'Profile2');
        const url = 'https://psnprofiles.com/trophies/2-game/Profile2';
        await trophyMissingCompletionDate(profile.id.toString(), url);
        fakeTrophySource.setTrophyData(url, {
            percentage: 12.3,
            completionDate: new Date('2021-06-29T00:00:00.000Z'),
        });

        const exitCode = await command.run(['--dry-run']);

        expect(exitCode).toBe(0);
        const [stillMissing] = await trophyRepository.findByProfile(profile.id.toString());
        expect(stillMissing?.completionDate).toBeNull();
    });

    test('respects --limit', async () => {
        const profile = await createTrophyProfile(undefined, 'user-3', 'Profile3');
        for (let i = 0; i < 5; i++) {
            const url = `https://psnprofiles.com/trophies/3-game/missing-${i}`;
            await trophyMissingCompletionDate(profile.id.toString(), url);
            fakeTrophySource.setTrophyData(url, {
                percentage: 12.3,
                completionDate: new Date('2021-06-29T00:00:00.000Z'),
            });
        }

        const exitCode = await command.run(['--limit=2']);

        expect(exitCode).toBe(0);
        const trophies = await trophyRepository.findByProfile(profile.id.toString());
        const fixedCount = trophies.filter((trophy) => trophy.completionDate !== null).length;
        expect(fixedCount).toBe(2);
    });

    test('is idempotent — a second run finds nothing left to fix', async () => {
        const profile = await createTrophyProfile(undefined, 'user-4', 'Profile4');
        const url = 'https://psnprofiles.com/trophies/4-game/Profile4';
        await trophyMissingCompletionDate(profile.id.toString(), url);
        fakeTrophySource.setTrophyData(url, {
            percentage: 12.3,
            completionDate: new Date('2021-06-29T00:00:00.000Z'),
        });

        await command.run([]);
        fakeTrophySource.trophyDataRequests.length = 0;
        const secondExitCode = await command.run([]);

        expect(secondExitCode).toBe(0);
        expect(fakeTrophySource.trophyDataRequests).toEqual([]);
    });

    test('a trophy whose fetch fails is counted failed but does not abort the run', async () => {
        const profile = await createTrophyProfile(undefined, 'user-5', 'Profile5');
        const badUrl = 'https://psnprofiles.com/trophies/5-game/bad';
        const goodUrl = 'https://psnprofiles.com/trophies/5-game/good';
        await trophyMissingCompletionDate(profile.id.toString(), badUrl);
        await trophyMissingCompletionDate(profile.id.toString(), goodUrl);
        fakeTrophySource.failTrophyDataWith(badUrl, new Error('PSNProfiles is down'));
        fakeTrophySource.setTrophyData(goodUrl, {
            percentage: 12.3,
            completionDate: new Date('2021-06-29T00:00:00.000Z'),
        });

        const exitCode = await command.run([]);

        expect(exitCode).toBe(1);
        const trophies = await trophyRepository.findByProfile(profile.id.toString());
        const good = trophies.find((trophy) => trophy.url === goodUrl);
        const bad = trophies.find((trophy) => trophy.url === badUrl);
        expect(good?.completionDate).not.toBeNull();
        expect(bad?.completionDate).toBeNull();
    });
});
