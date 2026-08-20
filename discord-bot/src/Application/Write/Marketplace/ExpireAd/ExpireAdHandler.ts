import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { ExpireAd } from './ExpireAd';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';

@injectable()
export class ExpireAdHandler implements CommandHandler<ExpireAd> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: ExpireAd): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        // Idempotent: `ads:lifecycle` and `ads:reconcile` both call this,
        // and either can legitimately see the same ad twice across runs (a
        // work-limited run one day, the rest the next). An ad that already
        // moved on — expired, sold, or (via a race with `/marketplace
        // delete`) deleted — is a no-op, not an error.
        if (!ad.status.equals(AdStatus.active()) && !ad.status.equals(AdStatus.pendingRenewal())) {
            this.logger.info('Ad already not active/pending — skipping expire', {
                id: command.id.toString(),
                status: ad.status.toString(),
                reason: command.reason,
            });
            return;
        }

        // Remove the listing message (cross-cutting rule: expire, never
        // delete the row — but the channel post itself should go, matching
        // what a manual /marketplace delete already does). Skips rows with
        // no message (the orphaned-no-message path never had one).
        // GuildClient.deleteMessage tolerates an already-gone message.
        if (ad.channelId && ad.messageId) {
            await this.guildClient.deleteMessage(ad.channelId, ad.messageId);
        }

        await this.adRepository.save(ad.withChanges({ status: AdStatus.expired() }));

        this.logger.info('Ad expired', {
            id: command.id.toString(),
            authorId: ad.authorId,
            reason: command.reason,
        });
    }
}
