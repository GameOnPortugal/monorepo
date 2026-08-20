import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../src/Infrastructure/DependencyInjection/types';
import { AdsReconcileJob } from '../../../../../src/Infrastructure/Job/Jobs/AdsReconcileJob';
import { AdStatus } from '../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import { createAd } from '../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../src/Domain/Marketplace/AdRepository';
import type { GuildClient } from '../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import type { JobContext } from '../../../../../src/Domain/Job/Job';

describe('AdsReconcileJob Integration Test', () => {
    let job: AdsReconcileJob;
    let ormClient: PrismaClient;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;

    const context = (overrides: Partial<JobContext> = {}): JobContext => ({
        dryRun: false,
        workLimit: 200,
        ...overrides,
    });

    beforeEach(async () => {
        job = myContainer.get<AdsReconcileJob>(AdsReconcileJob);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('exposes a stable name and the daily 03:00 schedule', () => {
        expect(job.name).toBe('ads-reconcile');
        expect(job.schedule).toBe('0 3 * * *');
    });

    it('marks an ad whose message has vanished as expired, and leaves a live one alone', async () => {
        const alive = await createAd(
            undefined,
            'Alive',
            undefined,
            '818447274266591243',
            'still-here',
        );
        const vanished = await createAd(
            undefined,
            'Vanished',
            undefined,
            '818447274266591243',
            'gone',
        );
        guildClient.registerMessage('still-here');
        // 'gone' never registered — mirrors a message a moderator deleted.

        const result = await job.run(context());

        const aliveAfter = await adRepository.get(alive.id);
        expect(aliveAfter.status.toString()).toBe('active');

        const vanishedAfter = await adRepository.get(vanished.id);
        expect(vanishedAfter.status.toString()).toBe('expired');

        expect(result.details?.vanished).toBe(1);
        expect(result.details?.alive).toBe(1);
    });

    it('counts empty-message_id (orphaned) rows separately, never reporting them as vanished', async () => {
        await createAd(undefined, 'Orphan', undefined, undefined, '');

        const result = await job.run(context());

        expect(result.details?.orphaned).toBe(1);
        expect(result.details?.vanished).toBe(0);
        // Nothing to check, so no attempt is made against GuildClient at all.
        expect(guildClient.deletedMessages).toHaveLength(0);
    });

    it("uses each ad row's own channel_id, not a single fixed channel (e.g. a DM channel for legacy rows)", async () => {
        const dmChannelId = '1026852888636555366'; // verified production DM channel, per docs
        const inDm = await createAd(undefined, 'DM ad', undefined, dmChannelId, 'dm-message');
        guildClient.registerMessage('dm-message');

        await job.run(context());

        const untouched = await adRepository.get(inDm.id);
        expect(untouched.status.toString()).toBe('active');
    });

    it('only reconciles active ads — sold/expired/deleted/pending_renewal rows are left alone', async () => {
        const sold = await createAd(
            undefined,
            'Sold',
            undefined,
            '818447274266591243',
            'sold-message',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.sold(),
        );
        // 'sold-message' deliberately never registered — if this ad were
        // reconciled it would look vanished; it must not be touched at all.

        const result = await job.run(context());

        const untouched = await adRepository.get(sold.id);
        expect(untouched.status.toString()).toBe('sold');
        expect(result.considered).toBe(0);
    });

    it('--dry-run writes nothing', async () => {
        const vanished = await createAd(
            undefined,
            'Vanished',
            undefined,
            '818447274266591243',
            'gone',
        );

        const result = await job.run(context({ dryRun: true }));

        expect(result.details?.vanished).toBe(1);
        const stillActive = await adRepository.get(vanished.id);
        expect(stillActive.status.toString()).toBe('active');
        expect(guildClient.deletedMessages).toHaveLength(0);
    });

    it('respects the work limit', async () => {
        for (let i = 0; i < 5; i++) {
            await createAd(undefined, `Ad ${i}`, undefined, '818447274266591243', `msg-${i}`);
        }

        const result = await job.run(context({ workLimit: 2 }));

        expect(result.considered).toBe(2);
    });

    it('never deletes a row', async () => {
        await createAd(undefined, 'Vanished', undefined, '818447274266591243', 'gone');

        const before = await ormClient.ad.count();
        await job.run(context());
        const after = await ormClient.ad.count();

        expect(after).toBe(before);
    });
});
