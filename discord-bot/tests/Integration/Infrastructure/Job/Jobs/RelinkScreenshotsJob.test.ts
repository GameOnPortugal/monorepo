import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { RelinkScreenshotsJob } from '../../../../../src/Infrastructure/Job/Jobs/RelinkScreenshotsJob.ts';
import type { ImageFetcher } from '../../../../../src/Infrastructure/Job/Jobs/RelinkScreenshotsJob.ts';
import { InMemoryGuildClient } from '../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import { InMemoryMediaStorage } from '../../../../../src/Infrastructure/Media/InMemoryMediaStorage.ts';
import type { MediaObject, MediaStorage } from '../../../../../src/Domain/Media/MediaStorage.ts';
import { ScreenshotId } from '../../../../../src/Domain/Screenshot/ScreenshotId.ts';
import { TYPES } from '../../../../../src/Infrastructure/DependencyInjection/types.ts';
import type { ScreenshotRepository } from '../../../../../src/Domain/Screenshot/ScreenshotRepository.ts';
import Logger from '../../../../../src/Application/Logger/Logger.ts';
import InMemoryLogger from '../../../../Helper/InMemoryLogger.ts';
import DatabaseUtil from '../../../../Helper/DatabaseUtil.ts';
import { myContainer } from '../../../../../src/Infrastructure/DependencyInjection/inversify.config.ts';
import { createScreenshot } from '../../../../Helper/StaticFixtures.ts';
import type { JobContext } from '../../../../../src/Domain/Job/Job.ts';

// The job sleeps between Discord calls to stay well under Discord's rate
// limits in production (see RelinkScreenshotsJob.ts's DEFAULT_THROTTLE_MS) —
// zero it out for tests so a run over a handful of fake rows is instant.
process.env.SCREENSHOT_RELINK_THROTTLE_MS = '0';

const POPULATION_A_URL = 'https://cdn.discordapp.com/attachments/1/2/old.png';
const POPULATION_B_URL = 'https://cdn.discordapp.com/ephemeral-attachments/1/2/old.png';

/** The shape of RelinkScreenshotsJob's `JobResult.details` — see its file doc. */
interface RelinkJobDetails {
    populationA: { unresolvedRows: { id: string; reason: string }[] };
    populationB: {
        unresolvedRows: { id: string; reason: string }[];
        unmatchedMessageIds: string[];
    };
}

/** Wraps a real InMemoryMediaStorage and counts put() calls — the thing the idempotency tests need to observe. */
class CountingMediaStorage implements MediaStorage {
    public putCalls = 0;
    constructor(private readonly inner: InMemoryMediaStorage) {}

    async put(object: MediaObject): Promise<string> {
        this.putCalls++;
        return this.inner.put(object);
    }

    async exists(key: string): Promise<boolean> {
        return this.inner.exists(key);
    }

    async delete(key: string): Promise<void> {
        return this.inner.delete(key);
    }
}

class FakeImageFetcher implements ImageFetcher {
    public calls: string[] = [];

    async fetch(url: string) {
        this.calls.push(url);
        return { bytes: new TextEncoder().encode(`bytes-for-${url}`), contentType: 'image/png' };
    }
}

function context(overrides: Partial<JobContext> = {}): JobContext {
    return { dryRun: false, workLimit: 200, ...overrides };
}

describe('RelinkScreenshotsJob', () => {
    let repository: ScreenshotRepository;
    let ormClient: PrismaClient;
    let guildClient: InMemoryGuildClient;
    let mediaStorage: CountingMediaStorage;
    let imageFetcher: FakeImageFetcher;
    let job: RelinkScreenshotsJob;

    beforeEach(async () => {
        repository = myContainer.get<ScreenshotRepository>(TYPES.ScreenshotRepository);
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);
        await DatabaseUtil.truncateAllTables();

        guildClient = new InMemoryGuildClient();
        mediaStorage = new CountingMediaStorage(new InMemoryMediaStorage());
        imageFetcher = new FakeImageFetcher();

        job = new RelinkScreenshotsJob(
            repository,
            guildClient,
            mediaStorage,
            imageFetcher,
            new Logger([new InMemoryLogger()]),
        );
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    test('exposes a stable name and a weekly schedule', () => {
        expect(job.name).toBe('screenshots-relink');
        expect(job.schedule).toBe('0 22 * * 6');
    });

    test('population A recovers from embeds[0].image.url using the already-correct message_id', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'msg-A1',
            undefined,
            POPULATION_A_URL,
        );
        guildClient.registerMessage(
            'msg-A1',
            {},
            { embedImageUrls: ['https://cdn.discordapp.com/attachments/1/2/fresh.png'] },
        );

        const result = await job.run(context());

        expect(result.considered).toBe(1);
        expect(result.changed).toBe(1);
        expect(result.failed).toBe(0);
        expect(imageFetcher.calls).toEqual([
            'https://cdn.discordapp.com/attachments/1/2/fresh.png',
        ]);

        const updated = await ormClient.screenshot.findUnique({
            where: { id: screenshot.id.toString() },
        });
        expect(updated?.message_id).toBe('msg-A1');
        expect(updated?.image).not.toContain('discordapp.com');
        expect(updated?.image).toContain('screenshots/');
    });

    test('population B is matched by ID: #<uuid> in message content and gets message_id repaired', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'wrong-interaction-id',
            undefined,
            POPULATION_B_URL,
        );
        const uuid = screenshot.id.toString();

        guildClient.registerMessage(
            'real-message-id',
            {},
            {
                content: `📸 **Screenshot Submitted!**\n\nID: #${uuid}\nAuthor: someone\nName: Cool shot\nPlatform: Playstation`,
                attachmentUrls: ['https://cdn.discordapp.com/attachments/9/9/real.png'],
            },
        );

        const result = await job.run(context());

        expect(result.changed).toBe(1);
        expect(result.failed).toBe(0);
        expect(imageFetcher.calls).toEqual(['https://cdn.discordapp.com/attachments/9/9/real.png']);

        const updated = await ormClient.screenshot.findUnique({ where: { id: uuid } });
        expect(updated?.message_id).toBe('real-message-id');
        expect(updated?.image).not.toContain('discordapp.com');
    });

    test('a row is never matched by anything other than its own UUID', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'wrong-interaction-id',
            undefined,
            POPULATION_B_URL,
        );
        const decoyId = ScreenshotId.generate().toString();

        // A message that "looks like" a plausible match (mentions the same
        // kind of content) but names a *different* UUID — must not match.
        guildClient.registerMessage(
            'decoy-message',
            {},
            {
                content: `📸 **Screenshot Submitted!**\n\nID: #${decoyId}\nAuthor: same-author\nName: Cool shot\nPlatform: Playstation`,
                attachmentUrls: ['https://cdn.discordapp.com/attachments/9/9/decoy.png'],
            },
        );

        const result = await job.run(context());

        expect(result.failed).toBe(1);
        expect(result.changed).toBe(0);
        expect(imageFetcher.calls).toHaveLength(0);

        const details = result.details as unknown as RelinkJobDetails;
        expect(details.populationB.unresolvedRows[0]?.id).toBe(screenshot.id.toString());
        // The decoy message was scanned and correctly reported as matching no row.
        expect(details.populationB.unmatchedMessageIds).toContain('decoy-message');
    });

    test('a row whose message has vanished is counted as failed, not thrown', async () => {
        await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'missing-message',
            undefined,
            POPULATION_A_URL,
        );
        // Deliberately not registered in guildClient — simulates a deleted message.

        const result = await job.run(context());

        expect(result.failed).toBe(1);
        expect(result.changed).toBe(0);
        const details = result.details as unknown as RelinkJobDetails;
        expect(details.populationA.unresolvedRows).toHaveLength(1);
    });

    test('--dry-run performs zero writes: no database update, no MediaStorage upload', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'msg-A1',
            undefined,
            POPULATION_A_URL,
        );
        guildClient.registerMessage(
            'msg-A1',
            {},
            { embedImageUrls: ['https://cdn.discordapp.com/attachments/1/2/fresh.png'] },
        );

        const result = await job.run(context({ dryRun: true }));

        expect(result.changed).toBe(1); // reports what *would* change
        expect(mediaStorage.putCalls).toBe(0);

        const untouched = await ormClient.screenshot.findUnique({
            where: { id: screenshot.id.toString() },
        });
        expect(untouched?.image).toBe(POPULATION_A_URL);
        expect(untouched?.message_id).toBe('msg-A1');
    });

    test('the work limit bounds how many rows a single run considers', async () => {
        for (let i = 0; i < 3; i++) {
            await createScreenshot(
                undefined,
                undefined,
                undefined,
                undefined,
                `msg-${i}`,
                undefined,
                POPULATION_A_URL,
            );
        }

        const result = await job.run(context({ workLimit: 2 }));

        expect(result.considered).toBe(2);
    });

    test('a second run is a no-op: already-migrated rows are not reconsidered and MediaStorage is not re-uploaded to', async () => {
        await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'msg-A1',
            undefined,
            POPULATION_A_URL,
        );
        guildClient.registerMessage(
            'msg-A1',
            {},
            { embedImageUrls: ['https://cdn.discordapp.com/attachments/1/2/fresh.png'] },
        );

        const first = await job.run(context());
        expect(first.changed).toBe(1);
        expect(mediaStorage.putCalls).toBe(1);

        const second = await job.run(context());

        expect(second.considered).toBe(0);
        expect(second.changed).toBe(0);
        expect(mediaStorage.putCalls).toBe(1); // unchanged — no re-upload
    });

    test('exists() short-circuits a row whose object is already in storage under its key', async () => {
        const screenshot = await createScreenshot(
            undefined,
            undefined,
            undefined,
            undefined,
            'msg-A1',
            undefined,
            POPULATION_A_URL,
        );
        // Simulate an object that already made it to storage (e.g. a prior
        // run that crashed after put() but before the DB write).
        const key = `screenshots/${screenshot.id.toString()}.png`;
        await mediaStorage.put({ key, body: new Uint8Array([1]), contentType: 'image/png' });
        mediaStorage.putCalls = 0; // reset — we only care about calls made *by the job*
        guildClient.registerMessage(
            'msg-A1',
            {},
            { embedImageUrls: ['https://cdn.discordapp.com/attachments/1/2/fresh.png'] },
        );

        const result = await job.run(context());

        expect(result.skipped).toBe(1);
        expect(mediaStorage.putCalls).toBe(0);
        expect(imageFetcher.calls).toHaveLength(0);
    });
});
