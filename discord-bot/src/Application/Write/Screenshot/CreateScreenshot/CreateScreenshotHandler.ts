import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { CreateScreenshot } from './CreateScreenshot';
import { Screenshot } from '../../../../Domain/Screenshot/Screenshot';
import type { ScreenshotRepository } from '../../../../Domain/Screenshot/ScreenshotRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import crypto from 'crypto';
import { ScreenshotAlreadyExist } from './ScreenshotAlreadyExist';
import {
    assertAllowedAttachmentHost,
    assertReportedSizeWithinLimit,
    downloadWithLimit,
} from './AttachmentGuard.ts';

// M4.9: this used to go through the injected TYPES.HttpClient
// (FetchHttpClient/RetryHttpClient), whose `get()` reads the whole response
// into a string via `response.text()` before handing it back — fine for the
// JSON APIs that abstraction was built for, wrong for a binary image that
// needs to be capped, streamed and hashed as bytes. downloadWithLimit()
// below is a dedicated path for that, not a general-purpose HttpClient.
@injectable()
export class CreateScreenshotHandler implements CommandHandler<CreateScreenshot> {
    constructor(
        @inject(TYPES.ScreenshotRepository)
        private readonly screenshotRepository: ScreenshotRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: CreateScreenshot): Promise<Screenshot> {
        const md5 = await this.generateMd5FromImageUrl(command.image, command.imageSize);

        if ((await this.screenshotRepository.findByMd5(md5)) !== null) {
            throw new ScreenshotAlreadyExist(`Screenshot with MD5 hash ${md5} already exists`);
        }

        // Create a new Screenshot entity
        const screenshot = new Screenshot(
            command.id,
            command.name,
            command.authorId,
            command.channelId,
            command.messageId,
            command.platform,
            command.image,
            md5,
            new Date(),
            new Date(),
        );

        // Save the screenshot using the repository
        await this.screenshotRepository.save(screenshot);

        this.logger.info('Screenshot created successfully', {
            id: screenshot.id.toString(),
            name: command.name,
            authorId: command.authorId,
        });

        return screenshot;
    }

    private async generateMd5FromImageUrl(imageUrl: string, imageSize?: number): Promise<string> {
        // Order matters and all three are needed (M4.9 / A4):
        //  1. Host allowlist — no network at all for a URL that isn't
        //     Discord's CDN.
        //  2. The size Discord reported on the attachment, if the caller
        //     has it — rejects an obviously-oversized upload before any
        //     request is made.
        //  3. downloadWithLimit()'s own Content-Length check plus a hard
        //     cap enforced while streaming — the real guard, since neither
        //     of the above can be trusted alone (the attachment size is
        //     client-reported, and Content-Length can be absent or wrong).
        assertAllowedAttachmentHost(imageUrl);
        if (imageSize !== undefined) {
            assertReportedSizeWithinLimit(imageSize);
        }

        const imageData = await downloadWithLimit(imageUrl);

        return crypto.createHash('md5').update(imageData).digest('hex');
    }
}
