import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { RenewAd } from './RenewAd';
import { Ad } from '../../../../Domain/Marketplace/Ad';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import { UnauthorizedAdRenewal } from '../../../../Domain/Marketplace/UnauthorizedAdRenewal';
import { AdNotEligibleForRenewal } from '../../../../Domain/Marketplace/AdNotEligibleForRenewal';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../../../Domain/Community/CommunityChannels';

/**
 * pt-PT repost content (cross-cutting rule 1). Deliberately not reused from
 * `SellSubcommand`'s (English) template — that file is in `Infrastructure/Bot`,
 * out of this PR's scope, and its English copy is itself tracked tech debt
 * (docs/known-issues.md), not something to propagate into new code.
 */
function buildRenewedListingContent(ad: Ad): string {
    return [
        '🔄 Anúncio renovado',
        `**${ad.name}**`,
        `💰 Preço: ${ad.price}`,
        `📍 Zona: ${ad.zone}`,
        `🚚 Envio: ${ad.dispatch}`,
        ad.warranty ? `⚡ Garantia: ${ad.warranty}` : '',
        ad.description ? `📝 ${ad.description}` : '',
        '',
        `Publicado por: <@${ad.authorId}>`,
    ]
        .filter(Boolean)
        .join('\n');
}

@injectable()
export class RenewAdHandler implements CommandHandler<RenewAd> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: RenewAd): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        // Ownership is re-checked here, server-side, off the row itself —
        // never trust the customId a button click carries (see
        // AdsLifecycleJob.ts's customId comment).
        if (ad.authorId !== command.userId) {
            throw new UnauthorizedAdRenewal(
                `User ${command.userId} is not authorized to renew ad ${command.id.toString()}`,
            );
        }

        if (!ad.status.equals(AdStatus.pendingRenewal())) {
            throw new AdNotEligibleForRenewal(
                `Ad ${command.id.toString()} is not eligible for renewal (status=${ad.status.toString()})`,
            );
        }

        // Genuinely bump: remove the old message, post a fresh one so the
        // listing returns to the bottom of #anuncios — that's the entire
        // point of a bump, not just flipping a flag. Tolerates an
        // already-gone message the same way DeleteAdHandler does.
        if (ad.channelId && ad.messageId) {
            await this.guildClient.deleteMessage(ad.channelId, ad.messageId);
        }

        const newMessageId = await this.guildClient.sendMessage(
            CommunityChannels.MARKETPLACE,
            buildRenewedListingContent(ad),
        );

        const now = new Date();
        await this.adRepository.save(
            ad.withChanges({
                status: AdStatus.active(),
                channelId: command.channelId,
                messageId: newMessageId,
                bumpedAt: now,
                // Cleared, not extended by a fixed window: an actively
                // renewed ad is exactly as fresh as one created today — the
                // idle clock (bumped_at) is what drives the next 14-day
                // prompt, `expires_at` has no meaning again until the ad
                // re-enters `pending_renewal`.
                expiresAt: null,
            }),
        );

        this.logger.info('Ad renewed', {
            id: command.id.toString(),
            authorId: ad.authorId,
            newMessageId,
        });
    }
}
