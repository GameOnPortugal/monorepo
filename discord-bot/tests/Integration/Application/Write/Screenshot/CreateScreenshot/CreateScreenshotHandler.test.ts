import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CreateScreenshot } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/CreateScreenshot';
import {
    CreateScreenshotHandler,
    type ImageFetcher,
} from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/CreateScreenshotHandler';
import { ScreenshotId } from '../../../../../../src/Domain/Screenshot/ScreenshotId';
import { ScreenshotAlreadyExist } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/ScreenshotAlreadyExist';
import { InvalidAttachment } from '../../../../../../src/Application/Write/Screenshot/CreateScreenshot/InvalidAttachment';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import type { ScreenshotRepository } from '../../../../../../src/Domain/Screenshot/ScreenshotRepository';
import { InMemoryMediaStorage } from '../../../../../../src/Infrastructure/Media/InMemoryMediaStorage.ts';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import Logger from '../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../Helper/InMemoryLogger';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil.ts';

const ATTACHMENT_URL = 'https://cdn.discordapp.com/attachments/1/2/screenshot.png';

/**
 * A fake `ImageFetcher` (the narrow `Pick<SafeImageFetcher, 'fetch'>` the
 * handler actually depends on) — no mocking library, no real network, and
 * no dependency on SafeImageFetcher's own Discord-CDN host allowlist, since
 * these tests only care about what CreateScreenshotHandler does with
 * whatever bytes it gets back.
 */
class FakeImageFetcher implements ImageFetcher {
    public calls: string[] = [];
    constructor(
        private readonly bytes: Uint8Array = new TextEncoder().encode('fake-image-bytes'),
        private readonly contentType = 'image/png',
    ) {}

    async fetch(url: string) {
        this.calls.push(url);
        return { bytes: this.bytes, contentType: this.contentType };
    }
}

describe('CreateScreenshotHandler Integration Test', () => {
    let repository: ScreenshotRepository;
    let ormClient: PrismaClient;
    let mediaStorage: InMemoryMediaStorage;
    let logger: Logger;

    beforeEach(async () => {
        repository = myContainer.get<ScreenshotRepository>(TYPES.ScreenshotRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        mediaStorage = new InMemoryMediaStorage();
        logger = new Logger([new InMemoryLogger()]);

        await DatabaseUtil.truncateAllTables();
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('re-hosts the image through MediaStorage and stores the durable URL, never the Discord CDN one', async () => {
        const screenshotId = ScreenshotId.generate();
        const fetcher = new FakeImageFetcher();
        const handler = new CreateScreenshotHandler(repository, logger, mediaStorage, fetcher);

        const command = new CreateScreenshot(
            screenshotId,
            'Test Screenshot',
            'user123',
            'channel123',
            'message123',
            'PS5',
            ATTACHMENT_URL,
        );

        const result = await handler.handle(command);

        expect(fetcher.calls).toEqual([ATTACHMENT_URL]);
        expect(result.image).not.toBeNull();
        expect(result.image).not.toContain('discordapp.com');
        expect(result.image).toContain('screenshots/');
        expect(result.image).toContain(screenshotId.toString());

        const createdScreenshot = await ormClient.screenshot.findUnique({
            where: { id: screenshotId.toString() },
        });
        expect(createdScreenshot?.image).toBe(result.image);
        expect(createdScreenshot?.message_id).toBe('message123');
        expect(createdScreenshot?.image_md5).toBeTruthy();
    });

    test('throws ScreenshotAlreadyExist when a screenshot with the same MD5 already exists', async () => {
        const fetcher = new FakeImageFetcher();
        const handler = new CreateScreenshotHandler(repository, logger, mediaStorage, fetcher);

        await handler.handle(
            new CreateScreenshot(
                ScreenshotId.generate(),
                'First Screenshot',
                'user123',
                'channel123',
                'message123',
                'PS5',
                ATTACHMENT_URL,
            ),
        );

        await expect(
            handler.handle(
                new CreateScreenshot(
                    ScreenshotId.generate(),
                    'Second Screenshot',
                    'user456',
                    'channel456',
                    'message456',
                    'PS5',
                    ATTACHMENT_URL,
                ),
            ),
        ).rejects.toThrow(ScreenshotAlreadyExist);
    });

    test('rejects an oversized reported attachment size before any download', async () => {
        const fetcher = new FakeImageFetcher();
        const handler = new CreateScreenshotHandler(repository, logger, mediaStorage, fetcher);

        const command = new CreateScreenshot(
            ScreenshotId.generate(),
            'Too Big',
            'user123',
            'channel123',
            'message123',
            'PS5',
            ATTACHMENT_URL,
            50 * 1024 * 1024, // way over the 10MiB cap
        );

        await expect(handler.handle(command)).rejects.toThrow(InvalidAttachment);
        expect(fetcher.calls).toHaveLength(0);
    });

    test('a second, distinct screenshot from the same submitter is not treated as a duplicate', async () => {
        const handler = new CreateScreenshotHandler(
            repository,
            logger,
            mediaStorage,
            new FakeImageFetcher(new TextEncoder().encode('image-one')),
        );
        const otherHandler = new CreateScreenshotHandler(
            repository,
            logger,
            mediaStorage,
            new FakeImageFetcher(new TextEncoder().encode('image-two')),
        );

        const first = await handler.handle(
            new CreateScreenshot(
                ScreenshotId.generate(),
                'First',
                'user123',
                'channel123',
                'message123',
                'PS5',
                ATTACHMENT_URL,
            ),
        );
        const second = await otherHandler.handle(
            new CreateScreenshot(
                ScreenshotId.generate(),
                'Second',
                'user123',
                'channel123',
                'message456',
                'PS5',
                'https://cdn.discordapp.com/attachments/1/3/other.png',
            ),
        );

        expect(first.image).not.toBe(second.image);
    });
});
