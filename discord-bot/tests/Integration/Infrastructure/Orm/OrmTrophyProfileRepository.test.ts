import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { TrophyProfileRepository } from '../../../../src/Domain/Trophy/TrophyProfileRepository';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createTrophyProfile } from '../../../Helper/StaticFixtures';

/**
 * M7.3: `findAllNonExcluded` is the candidate set `TrophiesSyncJob` walks
 * every run — a profile flagged `isExcluded` (by auto-moderation or by
 * hand) must simply stop appearing here, which is also what makes the sync
 * job "forget" a flagged profile without any extra bookkeeping.
 */
describe('OrmTrophyProfileRepository — findAllNonExcluded', () => {
    let trophyProfileRepository: TrophyProfileRepository;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        trophyProfileRepository = myContainer.get<TrophyProfileRepository>(
            TYPES.TrophyProfileRepository,
        );
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('returns non-excluded profiles and omits excluded ones', async () => {
        const included = await createTrophyProfile(
            undefined,
            'user-1',
            'Included',
            false,
            false,
            false,
        );
        await createTrophyProfile(undefined, 'user-2', 'Excluded', false, false, true);

        const result = await trophyProfileRepository.findAllNonExcluded();

        const ids = result.map((profile) => profile.id.toString());
        expect(ids).toContain(included.id.toString());
        expect(ids).toHaveLength(1);
    });

    test('returns an empty array when every profile is excluded', async () => {
        await createTrophyProfile(undefined, 'user-3', 'Excluded1', false, false, true);
        await createTrophyProfile(undefined, 'user-4', 'Excluded2', true, false, true);

        const result = await trophyProfileRepository.findAllNonExcluded();

        expect(result).toEqual([]);
    });
});
