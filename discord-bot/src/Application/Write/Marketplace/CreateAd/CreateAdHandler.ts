import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { CreateAd } from './CreateAd';
import { Ad } from '../../../../Domain/Marketplace/Ad';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import { parsePriceCents } from '../../../../Domain/Marketplace/AdPrice';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import {
    AD_LIFECYCLE_MAX_AGE_DAYS,
    addDays,
} from '../../../../Domain/Marketplace/AdLifecyclePolicy';

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

        // One `now` for all three timestamps: an ad created at 23:59:59.9
        // should not have `createdAt` and `expires_at` land a tenth of a
        // second apart on different days' worth of arithmetic.
        const now = new Date();

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
            now,
            now,
            AdStatus.active(),
            parsePriceCents(command.price),
            command.images,
            null,
            // The 30-day deadline is set here, at creation, rather than left
            // NULL until something prompts the owner (M6.9). Two reasons:
            // the portal renders this column publicly as "Expira", so a NULL
            // means the listing shows no expiry at all while the ad quietly
            // lives forever; and `ads:lifecycle`'s backstop can only expire
            // what has a deadline to be past. Renewing or bumping pushes it
            // out again — this is a ceiling on neglect, not on the ad.
            addDays(now, AD_LIFECYCLE_MAX_AGE_DAYS),
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
