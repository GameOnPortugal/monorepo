import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

export class CreateAd implements Command {
    constructor(
        public readonly id: AdId,
        public readonly name: string,
        public readonly authorId: string,
        public readonly channelId: string,
        public readonly messageId: string,
        public readonly state: string,
        public readonly price: string,
        public readonly zone: string,
        public readonly dispatch: string,
        public readonly warranty: string,
        public readonly description: string,
        public readonly adType: string,
        /**
         * Already-durable image URLs (M5.11) — re-hosted through
         * `MediaStorage` by the caller (`SellSubcommand`/`WantedSubcommand`,
         * via `AdImageUploader`) *before* the listing is even posted, never
         * a raw Discord CDN URL. It has to happen that early, not inside
         * this handler: the posted embed's image is set from the very first
         * render (`renderAdListing`), so persisting is not the first place a
         * durable URL is needed — posting is.
         */
        public readonly images: string[] = [],
    ) {}
}
