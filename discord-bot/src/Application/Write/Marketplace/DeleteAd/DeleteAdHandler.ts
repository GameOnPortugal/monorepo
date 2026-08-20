import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { DeleteAd } from './DeleteAd';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import { UnauthorizedAdDeletion } from '../../../../Domain/Marketplace/UnauthorizedAdDeletion';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';

@injectable()
export class DeleteAdHandler implements CommandHandler<DeleteAd> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
    ) {}

    async handle(command: DeleteAd): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        // Owner OR admin (M5.10) — re-checked here, server-side, off the row
        // itself, same shape as MarkAdSoldHandler's equivalent check:
        // `command.isAdmin` reflects the *caller's* permission bits as read
        // by the caller (never trusted from a customId), but `command.userId`
        // still has to be compared against the row's own `authorId` for the
        // non-admin case.
        if (ad.authorId !== command.userId && !command.isAdmin) {
            throw new UnauthorizedAdDeletion(
                `User ${command.userId} is not authorized to delete ad ${command.id.toString()}`,
            );
        }

        // Remove the listing message before touching the row (M5.2). Skip
        // rows with no message to delete — 28 production ads carry an empty
        // `message_id` from the M0.1 write-back bug, and there is nothing to
        // clean up on Discord's side for those. `GuildClient.deleteMessage`
        // itself tolerates an already-gone message (a moderator may have
        // removed it by hand), so this never blocks the row from being
        // deleted.
        if (ad.channelId && ad.messageId) {
            await this.guildClient.deleteMessage(ad.channelId, ad.messageId);
        }

        // Soft-delete the row (cross-cutting rule 2): never destroy the data,
        // the old bot's hard-delete-on-expiry is why nothing from it could
        // ever be reconstructed.
        await this.adRepository.delete(command.id);

        this.logger.info('Ad deleted successfully', {
            id: command.id.toString(),
            userId: command.userId,
            asAdmin: command.isAdmin && ad.authorId !== command.userId,
        });
    }
}
