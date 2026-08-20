import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { MarkAdSold } from './MarkAdSold';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import { UnauthorizedAdAction } from '../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../Domain/Marketplace/AdNotActive';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';

@injectable()
export class MarkAdSoldHandler implements CommandHandler<MarkAdSold> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: MarkAdSold): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        // Owner OR admin (the one action in M5.6 that allows the override —
        // bump/edit stay owner-only). Re-checked here, server-side, off the
        // row itself: `command.isAdmin` reflects the *clicker's* permission
        // bits as read by the caller, but `command.userId` still has to be
        // compared against the row's own `authorId` for the non-admin case,
        // never trusted from a customId (see CustomId.ts).
        if (ad.authorId !== command.userId && !command.isAdmin) {
            throw new UnauthorizedAdAction(
                `User ${command.userId} is not authorized to mark ad ${command.id.toString()} sold`,
            );
        }

        if (!ad.status.equals(AdStatus.active())) {
            throw new AdNotActive(
                `Ad ${command.id.toString()} is not active (status=${ad.status.toString()})`,
            );
        }

        // Remove the listing message first, same ordering as DeleteAdHandler
        // (M5.2) and for the same reason: the row is the source of truth,
        // the message is a projection of it, so the row should not go stale
        // before the projection is cleaned up. Tolerates an already-gone
        // message (GuildClient.deleteMessage's own tolerance) and rows with
        // no message at all.
        if (ad.channelId && ad.messageId) {
            await this.guildClient.deleteMessage(ad.channelId, ad.messageId);
        }

        await this.adRepository.save(
            ad.withChanges({ status: AdStatus.sold(), soldAt: new Date() }),
        );

        this.logger.info('Ad marked sold', {
            id: command.id.toString(),
            authorId: ad.authorId,
            asAdmin: command.isAdmin && ad.authorId !== command.userId,
        });
    }
}
