import { describe, expect, beforeEach, it, afterEach } from 'bun:test';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import { FindAdsDueForLifecycleAction } from '../../../../../../src/Application/Query/Marketplace/FindAdsDueForLifecycleAction/FindAdsDueForLifecycleAction';
import type { AdLifecycleCandidates } from '../../../../../../src/Application/Query/Marketplace/FindAdsDueForLifecycleAction/FindAdsDueForLifecycleActionHandler';
import { AdStatus } from '../../../../../../src/Domain/Marketplace/AdStatus';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { PrismaClient } from '@prisma/client';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import { createAd } from '../../../../../Helper/StaticFixtures';

describe('FindAdsDueForLifecycleActionHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;

    const now = new Date('2026-08-20T10:00:00Z');
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    it('an ad idle exactly 14 days is due for a prompt; one idle 13 days is not', async () => {
        const idle14 = await createAd(
            undefined,
            'Idle 14 days',
            undefined,
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
        await createAd(
            undefined,
            'Idle 13 days',
            undefined,
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

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.idle.map((ad) => ad.id.toString())).toEqual([idle14.id.toString()]);
    });

    it('uses bumped_at instead of createdAt for the idle clock when an ad has been bumped', async () => {
        // Created a year ago, but bumped 5 days ago — not idle yet.
        const recentlyBumped = await createAd(
            undefined,
            'Recently bumped',
            undefined,
            undefined,
            'msg-bumped',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(400),
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(5),
        );

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.idle.map((ad) => ad.id.toString())).not.toContain(
            recentlyBumped.id.toString(),
        );
    });

    it('buckets active ads with an empty message_id as orphaned, not idle', async () => {
        const orphan = await createAd(
            undefined,
            'Orphan',
            undefined,
            undefined,
            '', // the M0.1 write-back shape
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(400),
        );

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.orphaned.map((ad) => ad.id.toString())).toEqual([orphan.id.toString()]);
        expect(candidates.idle.map((ad) => ad.id.toString())).not.toContain(orphan.id.toString());
    });

    it('an ad pending_renewal whose deadline has passed is due for expiry; one still inside the window is not', async () => {
        const overdue = await createAd(
            undefined,
            'Overdue',
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
            new Date(now.getTime() - 60 * 60 * 1000), // deadline was 1h ago
        );
        await createAd(
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
            new Date(now.getTime() + 60 * 60 * 1000), // deadline is 1h from now
        );

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.awaitingExpiry.map((ad) => ad.id.toString())).toEqual([
            overdue.id.toString(),
        ]);
    });

    it('an active ad past its own expires_at is bucketed pastExpiry, not idle', async () => {
        // The production shape this whole backstop exists for: `expires_at`
        // long gone, owner unreachable, ad still listed months later.
        const overdue = await createAd(
            undefined,
            'Overdue',
            undefined,
            undefined,
            'msg-overdue',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(400),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(300),
        );

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.pastExpiry.map((ad) => ad.id.toString())).toEqual([
            overdue.id.toString(),
        ]);
        // Not also queued for a DM — nobody should be asked to renew an ad
        // the same run is about to end.
        expect(candidates.idle.map((ad) => ad.id.toString())).not.toContain(overdue.id.toString());
    });

    it('an active ad whose expires_at is still ahead is left alone by the backstop', async () => {
        const fresh = await createAd(
            undefined,
            'Still within its window',
            undefined,
            undefined,
            'msg-fresh',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(20),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        );

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.pastExpiry).toHaveLength(0);
        // Idle for 20 days, so it is still due the ordinary 14-day prompt —
        // the backstop narrows nothing it should not.
        expect(candidates.idle.map((ad) => ad.id.toString())).toEqual([fresh.id.toString()]);
    });

    it('an orphaned ad that is also past expiry is claimed once, by the orphaned bucket', async () => {
        const both = await createAd(
            undefined,
            'Orphan and overdue',
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
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            daysAgo(300),
        );

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 200),
        );

        expect(candidates.orphaned.map((ad) => ad.id.toString())).toEqual([both.id.toString()]);
        expect(candidates.pastExpiry).toHaveLength(0);
        expect(candidates.idle).toHaveLength(0);
    });

    it('respects limitPerBucket', async () => {
        for (let i = 0; i < 5; i++) {
            await createAd(
                undefined,
                `Idle ${i}`,
                undefined,
                undefined,
                `msg-${i}`,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                daysAgo(30),
            );
        }

        const candidates: AdLifecycleCandidates = await commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, 2),
        );

        expect(candidates.idle).toHaveLength(2);
    });
});
