import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../src/Infrastructure/DependencyInjection/types';
import { AdsLifecycleJob } from '../../../../../src/Infrastructure/Job/Jobs/AdsLifecycleJob';
import { AdStatus } from '../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import { createAd } from '../../../../Helper/StaticFixtures';
import type { AdRepository } from '../../../../../src/Domain/Marketplace/AdRepository';
import type { GuildClient } from '../../../../../src/Domain/Community/GuildClient';
import { InMemoryGuildClient } from '../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient';
import type { JobContext } from '../../../../../src/Domain/Job/Job';

describe('AdsLifecycleJob Integration Test', () => {
    let job: AdsLifecycleJob;
    let ormClient: PrismaClient;
    let adRepository: AdRepository;
    let guildClient: InMemoryGuildClient;

    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

    const context = (overrides: Partial<JobContext> = {}): JobContext => ({
        dryRun: false,
        workLimit: 200,
        ...overrides,
    });

    beforeEach(async () => {
        job = myContainer.get<AdsLifecycleJob>(AdsLifecycleJob);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        adRepository = myContainer.get<AdRepository>(TYPES.AdRepository);
        guildClient = myContainer.get<GuildClient>(TYPES.GuildClient) as InMemoryGuildClient;

        await DatabaseUtil.truncateAllTables();
        guildClient.reset();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('exposes a stable name and the daily 10:00 schedule', () => {
        expect(job.name).toBe('ads-lifecycle');
        expect(job.schedule).toBe('0 10 * * *');
    });

    it('prompts an ad idle 14 days, but not one idle only 13 days', async () => {
        const userId = '123456789012345678';
        const idle14 = await createAd(
            undefined,
            'Idle 14',
            userId,
            undefined,
            'msg-14',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(14),
        );
        const idle13 = await createAd(
            undefined,
            'Idle 13',
            '987654321098765432',
            undefined,
            'msg-13',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(13),
        );

        const result = await job.run(context());

        expect(result.failed).toBe(0);
        expect(guildClient.sentDirectMessages).toHaveLength(1);
        expect(guildClient.sentDirectMessages[0]!.userId).toBe(userId);

        const prompted = await adRepository.get(idle14.id);
        expect(prompted.status.toString()).toBe('pending_renewal');
        expect(prompted.expiresAt).not.toBeNull();

        const untouched = await adRepository.get(idle13.id);
        expect(untouched.status.toString()).toBe('active');
    });

    it('expires an orphaned ad (empty message_id) directly, with no DM', async () => {
        const ad = await createAd(
            undefined,
            'Orphan',
            undefined,
            undefined,
            '',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(400),
        );

        const result = await job.run(context());

        expect(guildClient.sentDirectMessages).toHaveLength(0);
        const updated = await adRepository.get(ad.id);
        expect(updated.status.toString()).toBe('expired');
        expect(result.details?.expiredOrphaned).toBe(1);
    });

    it('expires a pending_renewal ad after 72h of silence', async () => {
        const ad = await createAd(
            undefined,
            'Waiting',
            undefined,
            '818447274266591243',
            'listing-message',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.pendingRenewal(),
            undefined,
            undefined,
            undefined,
            hoursAgo(1), // deadline passed an hour ago
        );
        guildClient.registerMessage('listing-message');

        const result = await job.run(context());

        const updated = await adRepository.get(ad.id);
        expect(updated.status.toString()).toBe('expired');
        expect(guildClient.deletedMessages).toEqual([
            { channelId: '818447274266591243', messageId: 'listing-message' },
        ]);
        expect(result.details?.expiredNoResponse).toBe(1);
    });

    it('does not expire a pending_renewal ad still inside its 72h window', async () => {
        const ad = await createAd(
            undefined,
            'Still waiting',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.pendingRenewal(),
            undefined,
            undefined,
            undefined,
            new Date(Date.now() + 60 * 60 * 1000),
        );

        await job.run(context());

        const untouched = await adRepository.get(ad.id);
        expect(untouched.status.toString()).toBe('pending_renewal');
    });

    it('a user with several expiring ads gets exactly one DM listing all of them', async () => {
        const userId = '123456789012345678';
        const ads = await Promise.all(
            [0, 1, 2].map((i) =>
                createAd(
                    undefined,
                    `Idle item ${i}`,
                    userId,
                    undefined,
                    `msg-${i}`,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    daysAgo(20),
                ),
            ),
        );

        await job.run(context());

        expect(guildClient.sentDirectMessages).toHaveLength(1);
        expect(guildClient.sentDirectMessages[0]!.message.buttons).toHaveLength(3);
        for (const ad of ads) {
            const updated = await adRepository.get(ad.id);
            expect(updated.status.toString()).toBe('pending_renewal');
        }
    });

    it('a closed DM does not expire (or otherwise change) the ad — it is logged and left for a later run', async () => {
        const userId = '123456789012345678';
        const ad = await createAd(
            undefined,
            'Idle',
            userId,
            undefined,
            'msg-x',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(20),
        );
        guildClient.closeDmFor(userId);

        const result = await job.run(context());

        expect(guildClient.sentDirectMessages).toHaveLength(0);
        const untouched = await adRepository.get(ad.id);
        expect(untouched.status.toString()).toBe('active');
        expect(result.details?.recipientsDmClosed).toBe(1);
    });

    it('--dry-run writes nothing: no status change, no message deletion, no DM sent', async () => {
        guildClient.registerMessage('vanishing-soon');
        await createAd(
            undefined,
            'Orphan',
            undefined,
            undefined,
            '',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(400),
        );
        await createAd(
            undefined,
            'Idle',
            '123456789012345678',
            undefined,
            'msg-idle',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(20),
        );
        await createAd(
            undefined,
            'Overdue',
            undefined,
            '818447274266591243',
            'vanishing-soon',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            AdStatus.pendingRenewal(),
            undefined,
            undefined,
            undefined,
            hoursAgo(1),
        );

        const result = await job.run(context({ dryRun: true }));

        expect(guildClient.sentDirectMessages).toHaveLength(0);
        expect(guildClient.deletedMessages).toHaveLength(0);
        expect(result.changed).toBeGreaterThan(0); // it did find things it *would* change

        const rows = await ormClient.ad.findMany();
        for (const row of rows) {
            expect(['active', 'pending_renewal']).toContain(row.status);
        }
    });

    it('respects the work limit across buckets: exhausting the budget on orphaned ads leaves idle ads untouched', async () => {
        // Each bucket query is itself bounded by workLimit, so a single
        // bucket alone never proves cross-bucket budget sharing — this
        // needs candidates in two buckets that together exceed workLimit.
        for (let i = 0; i < 3; i++) {
            await createAd(
                undefined,
                `Orphan ${i}`,
                undefined,
                undefined,
                '',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                daysAgo(400),
            );
        }
        for (let i = 0; i < 3; i++) {
            await createAd(
                undefined,
                `Idle ${i}`,
                `22222222222222222${i}`,
                undefined,
                `msg-${i}`,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                daysAgo(20),
            );
        }

        const result = await job.run(context({ workLimit: 2 }));

        // The whole budget (2) is spent expiring orphaned ads first; every
        // idle candidate this run saw is left exactly as it was.
        expect(result.changed).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.skipped).toBeGreaterThan(0);
        expect(guildClient.sentDirectMessages).toHaveLength(0);
    });

    it('caps new prompts to at most a handful of distinct recipients per run (the first-run mass-DM guard)', async () => {
        // Seven distinct authors, each with one idle ad — simulates the
        // production first-run backlog. Only a small number should be
        // DM'd in a single run; the rest wait for the next scheduled run.
        for (let i = 0; i < 7; i++) {
            await createAd(
                undefined,
                `Idle ${i}`,
                `11111111111111111${i}`,
                undefined,
                `msg-${i}`,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                daysAgo(20),
            );
        }

        const result = await job.run(context());

        expect(guildClient.sentDirectMessages.length).toBeLessThan(7);
        expect(guildClient.sentDirectMessages.length).toBeGreaterThan(0);
        expect(result.details?.recipientsSkippedGrace).toBeGreaterThan(0);
    });

    it('never deletes a row — the ads table row count is unchanged after a run that expires and prompts ads', async () => {
        await createAd(
            undefined,
            'Orphan',
            undefined,
            undefined,
            '',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(400),
        );
        await createAd(
            undefined,
            'Idle',
            undefined,
            undefined,
            'msg-idle',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(20),
        );

        const before = await ormClient.ad.count();
        await job.run(context());
        const after = await ormClient.ad.count();

        expect(after).toBe(before);
    });
});
