import { inject, injectable } from 'inversify';
import { TYPES } from '../DependencyInjection/types';
import type { MediaStorage } from '../../Domain/Media/MediaStorage';
import type { SafeImageFetcher } from './SafeImageFetcher';
import { adPhotoMediaKey } from '../../Domain/Media/MediaKey';
import { extensionFromAdImageUrl } from '../../Domain/Marketplace/AdImageSource';

/** Narrowed to the one method actually called — same reasoning as `CreateScreenshotHandler.ts`'s `ImageFetcher` type. */
export type ImageFetcher = Pick<SafeImageFetcher, 'fetch'>;

/**
 * M5.11 — re-hosts a marketplace photo through `MediaStorage` at *submit*
 * time, on `MediaStorage`/`SafeImageFetcher` (M6.0), not a new adapter.
 *
 * Deliberately its own small class, called directly from
 * `SellSubcommand`/`WantedSubcommand` **before** the listing is posted —
 * unlike `CreateScreenshotHandler`'s re-host (which happens after the
 * message post, because a screenshot's *file attachment* is durable the
 * moment Discord accepts the upload), a marketplace listing's photo is an
 * **embed image URL**, not a file attachment. `embed.setImage(url)` just
 * points the client at whatever URL is on the message — Discord never
 * re-hosts it — so posting the embed with a raw Discord CDN URL would bake a
 * 24-hour-lived link straight into the message from the start. The durable
 * MinIO URL has to exist *before* the first `renderAdListing()` call, not
 * after.
 */
@injectable()
export class AdImageUploader {
    constructor(
        @inject(TYPES.MediaStorage) private readonly mediaStorage: MediaStorage,
        @inject(TYPES.SafeImageFetcher) private readonly imageFetcher: ImageFetcher,
    ) {}

    /** Fetches `discordAttachmentUrl` and re-hosts it at `ads/<adId>/0.<ext>`, returning the durable public URL. */
    async upload(adId: string, discordAttachmentUrl: string): Promise<string> {
        const { bytes, contentType } = await this.imageFetcher.fetch(discordAttachmentUrl);
        const key = adPhotoMediaKey(adId, 0, extensionFromAdImageUrl(discordAttachmentUrl));
        return this.mediaStorage.put({ key, body: bytes, contentType });
    }
}
