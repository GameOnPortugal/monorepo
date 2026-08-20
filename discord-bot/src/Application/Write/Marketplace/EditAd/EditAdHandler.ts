import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { EditAd } from './EditAd';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import { UnauthorizedAdAction } from '../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../Domain/Marketplace/AdNotActive';
import { parsePriceCents } from '../../../../Domain/Marketplace/AdPrice';
import { renderAdListing } from '../../../../Domain/Marketplace/AdListingRenderer';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';

@injectable()
export class EditAdHandler implements CommandHandler<EditAd> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: EditAd): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        if (ad.authorId !== command.userId) {
            throw new UnauthorizedAdAction(
                `User ${command.userId} is not authorized to edit ad ${command.id.toString()}`,
            );
        }

        if (!ad.status.equals(AdStatus.active())) {
            throw new AdNotActive(
                `Ad ${command.id.toString()} is not active (status=${ad.status.toString()})`,
            );
        }

        const updated = ad.cloneWith({
            price: command.price,
            priceCents: parsePriceCents(command.price),
            description: command.description,
        });

        await this.adRepository.save(updated);

        // Re-render the posted message in place (M5.6) — an edit does not
        // move the listing to the bottom of the channel the way a bump
        // does, so this is `editRichMessage`, not delete-then-repost.
        // Tolerates an already-gone message: the row is still the source of
        // truth, and the edit already succeeded there.
        if (updated.channelId && updated.messageId) {
            await this.guildClient.editRichMessage(
                updated.channelId,
                updated.messageId,
                renderAdListing(updated),
            );
        }

        this.logger.info('Ad edited', {
            id: command.id.toString(),
            authorId: ad.authorId,
        });
    }
}
