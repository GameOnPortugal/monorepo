import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { CreateScreenshot } from './CreateScreenshot';
import { Screenshot } from '../../../../Domain/Screenshot/Screenshot';
import type { ScreenshotRepository } from '../../../../Domain/Screenshot/ScreenshotRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import crypto from 'crypto';
import { ScreenshotAlreadyExist } from './ScreenshotAlreadyExist';
import { assertReportedSizeWithinLimit } from './AttachmentGuard.ts';
import type { SafeImageFetcher } from '../../../../Infrastructure/Media/SafeImageFetcher.ts';
import type { MediaStorage } from '../../../../Domain/Media/MediaStorage.ts';
import { screenshotMediaKey } from '../../../../Domain/Media/MediaKey.ts';
import { extensionFromImageUrl } from '../../../../Domain/Screenshot/ScreenshotImageSource.ts';

/**
 * Narrowed to the one method this handler calls, so a test can hand-roll a
 * fake `fetch()` without touching the real network-facing class or its host
 * allowlist — same pattern as `WeekScreenshotWinnerJob.ts`'s
 * `WeekScreenshotWinnerCommand`.
 */
export type ImageFetcher = Pick<SafeImageFetcher, 'fetch'>;

// M4.9's ingest guards (host allowlist, size cap, streamed byte cap, timeout)
// and M6.2's re-host-at-submit-time both now go through the same
// `SafeImageFetcher` (Infrastructure/Media/SafeImageFetcher.ts, M6.0) —
// see AttachmentGuard.ts's doc comment for why they were briefly duplicated.
@injectable()
export class CreateScreenshotHandler implements CommandHandler<CreateScreenshot> {
    constructor(
        @inject(TYPES.ScreenshotRepository)
        private readonly screenshotRepository: ScreenshotRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.MediaStorage) private readonly mediaStorage: MediaStorage,
        @inject(TYPES.SafeImageFetcher) private readonly imageFetcher: ImageFetcher,
    ) {}

    async handle(command: CreateScreenshot): Promise<Screenshot> {
        if (command.imageSize !== undefined) {
            assertReportedSizeWithinLimit(command.imageSize);
        }

        const { bytes, contentType } = await this.imageFetcher.fetch(command.image);
        const md5 = crypto.createHash('md5').update(bytes).digest('hex');

        if ((await this.screenshotRepository.findByMd5(md5)) !== null) {
            throw new ScreenshotAlreadyExist(`Screenshot with MD5 hash ${md5} already exists`);
        }

        // Cross-cutting rule 3: `command.image` is a Discord CDN URL — signed,
        // dead within 24h — so it must never be the value written to the
        // durable `image` column. Re-host through MediaStorage and store
        // *that* URL instead. The key's extension is read from the source
        // URL (not the downloaded Content-Type) so RelinkScreenshotsJob,
        // which only ever sees this row's `image` column, can recompute the
        // exact same key later — see ScreenshotImageSource.ts.
        const key = screenshotMediaKey(command.id.toString(), extensionFromImageUrl(command.image));
        const durableUrl = await this.mediaStorage.put({ key, body: bytes, contentType });

        const screenshot = new Screenshot(
            command.id,
            command.name,
            command.authorId,
            command.channelId,
            command.messageId,
            command.platform,
            durableUrl,
            md5,
            new Date(),
            new Date(),
        );

        await this.screenshotRepository.save(screenshot);

        this.logger.info('Screenshot created successfully', {
            id: screenshot.id.toString(),
            name: command.name,
            authorId: command.authorId,
        });

        return screenshot;
    }
}
