import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import CommandHandlerManager from '../../../../../../src/Infrastructure/CommandHandler/CommandHandlerManager';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { DeleteMemberData } from '../../../../../../src/Application/Write/Privacy/DeleteMemberData/DeleteMemberData';
import { SetPrivacyOptOut } from '../../../../../../src/Application/Write/Privacy/SetPrivacyOptOut/SetPrivacyOptOut';
import type { DeleteMemberDataResult } from '../../../../../../src/Application/Write/Privacy/DeleteMemberData/DeleteMemberDataResult';

/**
 * GDPR erasure (M9.7): this must be a *real* delete, not a hide. Every
 * assertion below checks the row is actually gone from the table — a soft
 * -delete-only implementation (e.g. calling `AdRepository.delete()`, which
 * only sets `status`/`deleted_at`) would still leave `description`/`price`/
 * `author_id` sitting in the row and would fail these.
 */
describe('DeleteMemberDataHandler Integration Test', () => {
    let commandHandlerManager: CommandHandlerManager;
    let ormClient: PrismaClient;

    const targetUser = 'gdpr-target-user';
    const otherUser = 'unrelated-other-user';
    // TrophyProfileId/TrophyId are validated (Id.isValid, length === 36) —
    // unlike AdId/ScreenshotId, which deleteAllByAuthor never parses back
    // into a VO, so plain fixture strings work for those.
    const profileId = crypto.randomUUID();
    const trophyId1 = crypto.randomUUID();
    const trophyId2 = crypto.randomUUID();
    const otherProfileId = crypto.randomUUID();

    beforeEach(async () => {
        commandHandlerManager = myContainer.get<CommandHandlerManager>(CommandHandlerManager);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        await DatabaseUtil.truncateAllTables();

        // Target user's content — including a soft-deleted ad, which erasure
        // must still remove (soft-delete alone was never enough for GDPR).
        await ormClient.ad.create({
            data: { id: 'ad-active', author_id: targetUser, name: 'Active ad', status: 'active' },
        });
        await ormClient.ad.create({
            data: {
                id: 'ad-soft-deleted',
                author_id: targetUser,
                name: 'Already soft-deleted ad',
                status: 'deleted',
                deleted_at: new Date(),
            },
        });
        await ormClient.screenshot.create({
            data: { id: 'shot-1', author_id: targetUser, name: 'Screenshot 1' },
        });
        await ormClient.trophyProfile.create({
            data: { id: profileId, userId: targetUser, psnProfile: 'TargetPsn' },
        });
        await ormClient.trophies.create({
            data: { id: trophyId1, trophyProfile: profileId, url: 'https://x/1', points: 10 },
        });
        await ormClient.trophies.create({
            data: { id: trophyId2, trophyProfile: profileId, url: 'https://x/2', points: 20 },
        });

        // Another member's content, which must survive untouched.
        await ormClient.ad.create({
            data: { id: 'ad-other', author_id: otherUser, name: 'Someone else', status: 'active' },
        });
        await ormClient.screenshot.create({
            data: { id: 'shot-other', author_id: otherUser, name: 'Someone else shot' },
        });
        await ormClient.trophyProfile.create({
            data: { id: otherProfileId, userId: otherUser, psnProfile: 'OtherPsn' },
        });
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('hard-deletes every ad (active and already soft-deleted), every screenshot, every trophy and the trophy profile', async () => {
        const result: DeleteMemberDataResult = await commandHandlerManager.handle(
            new DeleteMemberData(targetUser),
        );

        expect(result).toEqual({
            adsDeleted: 2,
            screenshotsDeleted: 1,
            trophiesDeleted: 2,
            trophyProfileDeleted: true,
        });

        expect(await ormClient.ad.findMany({ where: { author_id: targetUser } })).toEqual([]);
        expect(await ormClient.screenshot.findMany({ where: { author_id: targetUser } })).toEqual(
            [],
        );
        expect(await ormClient.trophyProfile.findUnique({ where: { id: profileId } })).toBeNull();
        expect(await ormClient.trophies.findMany({ where: { trophyProfile: profileId } })).toEqual(
            [],
        );
    });

    test('does not touch another member’s ads, screenshots or trophy profile', async () => {
        await commandHandlerManager.handle(new DeleteMemberData(targetUser));

        expect(await ormClient.ad.findUnique({ where: { id: 'ad-other' } })).not.toBeNull();
        expect(
            await ormClient.screenshot.findUnique({ where: { id: 'shot-other' } }),
        ).not.toBeNull();
        expect(
            await ormClient.trophyProfile.findUnique({ where: { id: otherProfileId } }),
        ).not.toBeNull();
    });

    test('also removes the opt-out row, and is a no-op (not an error) for a member with no trophy profile and no opt-out row', async () => {
        await commandHandlerManager.handle(new SetPrivacyOptOut(targetUser, true));
        expect(
            await ormClient.privacySetting.findUnique({ where: { discordId: targetUser } }),
        ).not.toBeNull();

        await commandHandlerManager.handle(new DeleteMemberData(targetUser));

        expect(
            await ormClient.privacySetting.findUnique({ where: { discordId: targetUser } }),
        ).toBeNull();

        const bareUser = 'user-with-nothing-at-all';
        const result: DeleteMemberDataResult = await commandHandlerManager.handle(
            new DeleteMemberData(bareUser),
        );

        expect(result).toEqual({
            adsDeleted: 0,
            screenshotsDeleted: 0,
            trophiesDeleted: 0,
            trophyProfileDeleted: false,
        });
    });
});
