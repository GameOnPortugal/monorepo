import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { BumpAd } from './BumpAd';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import { UnauthorizedAdAction } from '../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../Domain/Marketplace/AdNotActive';
import { AdBumpRateLimited } from '../../../../Domain/Marketplace/AdBumpRateLimited';
import { canBumpNow, nextBumpEligibleAt } from '../../../../Domain/Marketplace/AdBumpPolicy';
import {
    AD_LIFECYCLE_MAX_AGE_DAYS,
    addDays,
} from '../../../../Domain/Marketplace/AdLifecyclePolicy';
import { renderAdListing } from '../../../../Domain/Marketplace/AdListingRenderer';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../../../Domain/Community/CommunityChannels';

@injectable()
export class BumpAdHandler implements CommandHandler<BumpAd> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: BumpAd): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        // Owner-only — see BumpAd.ts's doc comment. Re-checked here off the
        // row, never trusted from a customId (CustomId.ts).
        if (ad.authorId !== command.userId) {
            throw new UnauthorizedAdAction(
                `User ${command.userId} is not authorized to bump ad ${command.id.toString()}`,
            );
        }

        if (!ad.status.equals(AdStatus.active())) {
            throw new AdNotActive(
                `Ad ${command.id.toString()} is not active (status=${ad.status.toString()})`,
            );
        }

        const now = new Date();
        if (!canBumpNow(ad.bumpedAt, now)) {
            const eligibleAt = nextBumpEligibleAt(ad.bumpedAt);
            throw new AdBumpRateLimited(
                `Ad ${command.id.toString()} was already bumped within the last ${72}h`,
                // canBumpNow only returns false when bumpedAt (and therefore
                // eligibleAt) is non-null, but TypeScript can't see that
                // through the two separate calls — the `!` documents it.
                eligibleAt!,
            );
        }

        // Genuinely bump: remove the old message, post a fresh one so the
        // listing returns to the bottom of #anuncios — the entire point of
        // a bump, not just touching a timestamp column. Tolerates an
        // already-gone message the same way DeleteAdHandler does.
        if (ad.channelId && ad.messageId) {
            await this.guildClient.deleteMessage(ad.channelId, ad.messageId);
        }

        const newMessageId = await this.guildClient.sendRichMessage(
            CommunityChannels.MARKETPLACE,
            renderAdListing(ad),
        );

        await this.adRepository.save(
            ad.withChanges({
                channelId: command.channelId,
                messageId: newMessageId,
                bumpedAt: now,
                // A bump is the owner saying "still available", so it resets
                // the 30-day backstop the same way a renewal does (M6.9) —
                // otherwise an ad bumped every week would still hit its
                // original creation-time deadline and expire underneath
                // someone who has been actively tending it.
                expiresAt: addDays(now, AD_LIFECYCLE_MAX_AGE_DAYS),
            }),
        );

        this.logger.info('Ad bumped', {
            id: command.id.toString(),
            authorId: ad.authorId,
            newMessageId,
        });
    }
}
