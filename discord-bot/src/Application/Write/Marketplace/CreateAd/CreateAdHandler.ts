import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { CreateAd } from './CreateAd';
import { Ad } from '../../../../Domain/Marketplace/Ad';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import { parsePriceCents } from '../../../../Domain/Marketplace/AdPrice';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';

@injectable()
export class CreateAdHandler implements CommandHandler<CreateAd> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: CreateAd): Promise<void> {
        // Create a new Ad entity. `priceCents` is parsed here (M5.9) rather
        // than left NULL until the first `/marketplace edit` — search's
        // `max_price` filter reads `price_cents`, and a freshly-created ad
        // that never gets edited should still be findable by price on day
        // one, not only after its owner happens to edit it. Same rule
        // `EditAdHandler` already uses (AdPrice.ts), so a listing's
        // searchability never depends on which path last touched its price.
        //
        // `command.images` (M5.11) is already durable by the time it gets
        // here — see CreateAd.ts's doc comment for why the re-host has to
        // happen before this handler runs, not inside it.
        const ad = new Ad(
            command.id,
            command.name,
            command.authorId,
            command.channelId,
            command.messageId,
            command.state,
            command.price,
            command.zone,
            command.dispatch,
            command.warranty,
            command.description,
            command.adType,
            new Date(),
            new Date(),
            AdStatus.active(),
            parsePriceCents(command.price),
            command.images,
        );

        // Save the ad using the repository
        await this.adRepository.save(ad);

        this.logger.info('Ad created successfully', {
            id: ad.id.toString(),
            name: command.name,
            authorId: command.authorId,
            hasImage: command.images.length > 0,
        });
    }
}
