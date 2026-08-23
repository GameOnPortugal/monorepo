import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../src/Infrastructure/DependencyInjection/types';
import type { TrophyProfileRepository } from '../../../../src/Domain/Trophy/TrophyProfileRepository';
import DatabaseUtil from '../../../Helper/DatabaseUtil';
import { createTrophyProfile } from '../../../Helper/StaticFixtures';
import { TrophyProfile } from '../../../../src/Domain/Trophy/TrophyProfile';

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

    test('markSynced stamps lastSyncedAt and touches nothing else', async () => {
        const profile = await createTrophyProfile(
            undefined,
            'user-5',
            'ToSync',
            false,
            true,
            false,
        );
        expect(profile.lastSyncedAt).toBeNull();

        const syncedAt = new Date('2026-08-23T10:00:00.000Z');
        await trophyProfileRepository.markSynced(profile.id, syncedAt);

        const reloaded = await trophyProfileRepository.get(profile.id);
        expect(reloaded.lastSyncedAt?.toISOString()).toBe(syncedAt.toISOString());
        // The flags this run was not asked to change must survive untouched
        // — the reason markSynced is a narrow update and not a save().
        expect(reloaded.hasLeft).toBe(true);
        expect(reloaded.isBanned).toBe(false);
        expect(reloaded.psnProfile).toBe('ToSync');
    });

    test('save() lets updatedAt advance instead of pinning it to a stale value', async () => {
        const profile = await createTrophyProfile(undefined, 'user-6', 'ToUpdate');
        const originalUpdatedAt = (await trophyProfileRepository.get(profile.id)).updatedAt;

        // A round-trip: load, change one flag, save. The entity carries the
        // updatedAt it was loaded with, and the repository used to write it
        // straight back, freezing the column forever.
        const loaded = await trophyProfileRepository.get(profile.id);
        await trophyProfileRepository.save(
            new TrophyProfile(
                loaded.id,
                loaded.userId,
                loaded.psnProfile,
                true,
                loaded.hasLeft,
                loaded.isExcluded,
                loaded.createdAt,
                loaded.updatedAt,
                loaded.lastSyncedAt,
            ),
        );

        const reloaded = await trophyProfileRepository.get(profile.id);
        expect(reloaded.isBanned).toBe(true);
        expect(reloaded.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    test('save() preserves an existing lastSyncedAt it was handed', async () => {
        const syncedAt = new Date('2026-08-23T11:00:00.000Z');
        const profile = await createTrophyProfile(
            undefined,
            'user-7',
            'Flagged',
            false,
            false,
            false,
            syncedAt,
        );

        const loaded = await trophyProfileRepository.get(profile.id);
        await trophyProfileRepository.save(
            new TrophyProfile(
                loaded.id,
                loaded.userId,
                loaded.psnProfile,
                true,
                loaded.hasLeft,
                loaded.isExcluded,
                loaded.createdAt,
                loaded.updatedAt,
                loaded.lastSyncedAt,
            ),
        );

        const reloaded = await trophyProfileRepository.get(profile.id);
        expect(reloaded.lastSyncedAt?.toISOString()).toBe(syncedAt.toISOString());
    });
});
