import { inject, injectable } from 'inversify';
import type { Job, JobContext, JobResult } from '../../../Domain/Job/Job.ts';
import type { ScreenshotRepository } from '../../../Domain/Screenshot/ScreenshotRepository.ts';
import type { Screenshot } from '../../../Domain/Screenshot/Screenshot.ts';
import type { CommunityMessage, GuildClient } from '../../../Domain/Community/GuildClient.ts';
import { CommunityChannels } from '../../../Domain/Community/CommunityChannels.ts';
import type { MediaStorage } from '../../../Domain/Media/MediaStorage.ts';
import { screenshotMediaKey } from '../../../Domain/Media/MediaKey.ts';
import { extensionFromImageUrl } from '../../../Domain/Screenshot/ScreenshotImageSource.ts';
import type { SafeImageFetcher } from '../../Media/SafeImageFetcher.ts';
import { TYPES } from '../../DependencyInjection/types.ts';
import type Logger from '../../../Application/Logger/Logger.ts';

/** Narrowed to the one method this job calls — see CreateScreenshotHandler.ts's identical `ImageFetcher` for the same reasoning. */
export type ImageFetcher = Pick<SafeImageFetcher, 'fetch'>;

const HISTORY_PAGE_SIZE = 100;

// Population B (the ~10 rewrite-era rows) only exists from 2025 onward — see
// the file doc below — so a bounded backward scan is enough; walking to the
// old bot's 2021 messages the way population A's message ids already let us
// skip is neither necessary nor safe to do unbounded on every run. 20 pages
// * 100 messages = 2000 messages of `#screenshots` history, comfortably
// covering "rewrite era to now" for a channel that gets a few submissions a
// week. Overridable for an operator who needs to look further back once.
const DEFAULT_MAX_HISTORY_PAGES = 20;

// Discord's own REST client (DiscordGuildClient's `REST`) already queues and
// backs off automatically on a 429, so this is deliberately just *extra*,
// conservative pacing on top of that — one request in flight at a time
// (everything below is sequential, never `Promise.all`'d) plus a short gap
// between requests, so a run over hundreds of rows doesn't front-load a
// burst before the client's own rate limiter has anything to react to.
const DEFAULT_THROTTLE_MS = 150;

const UUID_PATTERN =
    /ID:\s*#([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

interface UnresolvedRow {
    id: string;
    reason: string;
}

interface PopulationOutcome {
    considered: number;
    changed: number;
    skipped: number;
    failed: number;
    unresolved: UnresolvedRow[];
}

function emptyOutcome(): PopulationOutcome {
    return { considered: 0, changed: 0, skipped: 0, failed: 0, unresolved: [] };
}

interface HistoryScan {
    /** uuid (lowercase) -> the message whose content named it. */
    matches: Map<string, CommunityMessage>;
    /** ids of scanned messages whose content named a UUID that matched no candidate row. */
    unmatchedMessageIds: string[];
    scannedMessages: number;
    /** How far back the scan actually reached, for honest "we stopped here" reporting. */
    oldestScanned: Date | undefined;
}

function sleep(ms: number): Promise<void> {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * `image` values matching `/ephemeral-attachments/` are the rewrite-era bug
 * (M6.2/#18): the row's `message_id` is actually `interaction.id`, which
 * never resolves, and the ephemeral attachment itself is gone for good —
 * not merely expired. Everything else (the old bot's `/attachments/` URLs,
 * ~614 of the 624 broken rows) has a *correct* `message_id` that still
 * resolves; only the image needs re-hosting. See the file doc for the full
 * two-population story.
 */
function isPopulationB(screenshot: Screenshot): boolean {
    return (screenshot.image ?? '').includes('/ephemeral-attachments/');
}

/**
 * M6.3 — recovers the 624 screenshots whose stored image is a dead Discord
 * CDN URL (cross-cutting rule 3: those URLs are signed and expire).
 *
 * Two populations, two different recoveries, verified against production on
 * 2026-08-20 (see the PR body for the full investigation):
 *
 * - **Population A** (~614 rows, old-bot era 2021-2024, `image` matches
 *   `/attachments/`): `message_id` is already correct. Fetch the message,
 *   read `embeds[0].image.url` — Discord re-signs that URL on every fetch,
 *   so it is live right now — download and re-host it. No channel scanning
 *   needed at all.
 * - **Population B** (~10 rows, rewrite era 2025-2026, `image` matches
 *   `/ephemeral-attachments/`): `message_id` is the *interaction* id (the
 *   M6.2 bug) and never resolves. The real posted message's `content`
 *   embeds the row's own UUID (`ID: #<uuid>`) — scan recent channel history,
 *   match **only** on that UUID (never filename/author/timestamp, all of
 *   which are attacker- or coincidence-controllable), repair `message_id`,
 *   and re-host from the matched message's live attachment.
 *
 * Idempotency: `ScreenshotRepository.findRequiringRelink()` only returns
 * rows whose `image` still points at a Discord CDN host, so a row this job
 * has already fixed simply stops being a candidate on the next run — that
 * is the main mechanism that makes repeated runs over 624 rows make
 * progress instead of re-doing finished work. `MediaStorage.exists()` is a
 * second, per-row idempotency check *within* that candidate set, for the
 * narrow case where a previous run uploaded an object but crashed before
 * writing the row (`put()` succeeded, `save()` never ran): the next run
 * sees `exists()` return true for that row's key and skips re-uploading it
 * rather than re-fetching from Discord and overwriting an object that is
 * already correct. `MediaStorage` has no read-back method by design (see
 * its doc comment) — so a row caught in exactly that crash window is
 * reported as skipped rather than silently left both un-uploaded-again and
 * un-linked; completing it is a manual follow-up, not something this job
 * fabricates a URL for.
 *
 * Never deletes: a row this job cannot recover is reported in
 * `JobResult.details`, never removed — cross-cutting rule 2.
 */
@injectable()
export class RelinkScreenshotsJob implements Job {
    public readonly name = 'screenshots-relink';
    // Saturday 22:00 — Europe/Lisbon, ahead of `week-screenshot-winner`'s
    // Sunday 23:50 (WeekScreenshotWinnerJob.ts), so a week's screenshots
    // have a chance to be relinked before the winner is computed from their
    // reaction counts.
    public readonly schedule = '0 22 * * 6';

    private readonly maxHistoryPages: number;
    private readonly throttleMs: number;

    constructor(
        @inject(TYPES.ScreenshotRepository)
        private readonly screenshotRepository: ScreenshotRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.MediaStorage) private readonly mediaStorage: MediaStorage,
        @inject(TYPES.SafeImageFetcher) private readonly imageFetcher: ImageFetcher,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {
        // Env-overridable rather than constructor-injected (like JobRunner's
        // own tick interval/work limit): this class is resolved by inversify
        // via `.toSelf()`, so every constructor parameter needs to be a
        // container-resolvable service, and a bare number/tuning knob is not
        // one — see JobRunner.ts's identical env-var pattern.
        this.maxHistoryPages = Number(
            process.env.SCREENSHOT_RELINK_MAX_HISTORY_PAGES ?? DEFAULT_MAX_HISTORY_PAGES,
        );
        this.throttleMs = Number(process.env.SCREENSHOT_RELINK_THROTTLE_MS ?? DEFAULT_THROTTLE_MS);
    }

    async run(context: JobContext): Promise<JobResult> {
        const candidates = await this.screenshotRepository.findRequiringRelink(context.workLimit);

        const populationA = emptyOutcome();
        const populationB = emptyOutcome();

        const bCandidates = candidates.filter(isPopulationB);
        const historyScan =
            bCandidates.length > 0
                ? await this.scanHistoryForUuids(bCandidates.map((row) => row.id.toString()))
                : {
                      matches: new Map<string, CommunityMessage>(),
                      unmatchedMessageIds: [],
                      scannedMessages: 0,
                      oldestScanned: undefined,
                  };

        for (const screenshot of candidates) {
            if (isPopulationB(screenshot)) {
                await this.processPopulationB(screenshot, historyScan, context, populationB);
            } else {
                await this.processPopulationA(screenshot, context, populationA);
            }
            await sleep(this.throttleMs);
        }

        this.logger.info('screenshots-relink.summary', {
            populationA: { ...populationA, unresolved: populationA.unresolved.length },
            populationB: { ...populationB, unresolved: populationB.unresolved.length },
            scannedMessages: historyScan.scannedMessages,
        });

        return {
            considered: populationA.considered + populationB.considered,
            changed: populationA.changed + populationB.changed,
            skipped: populationA.skipped + populationB.skipped,
            failed: populationA.failed + populationB.failed,
            details: {
                populationA: {
                    considered: populationA.considered,
                    changed: populationA.changed,
                    skipped: populationA.skipped,
                    failed: populationA.failed,
                    unresolvedRows: populationA.unresolved,
                },
                populationB: {
                    considered: populationB.considered,
                    changed: populationB.changed,
                    skipped: populationB.skipped,
                    failed: populationB.failed,
                    unresolvedRows: populationB.unresolved,
                    scannedMessages: historyScan.scannedMessages,
                    scannedBackTo: historyScan.oldestScanned?.toISOString() ?? null,
                    unmatchedMessageIds: historyScan.unmatchedMessageIds,
                },
            },
        };
    }

    private async processPopulationA(
        screenshot: Screenshot,
        context: JobContext,
        outcome: PopulationOutcome,
    ): Promise<void> {
        outcome.considered++;
        const id = screenshot.id.toString();

        try {
            const key = screenshotMediaKey(id, extensionFromImageUrl(screenshot.image ?? ''));
            if (await this.mediaStorage.exists(key)) {
                outcome.skipped++;
                return;
            }

            if (!screenshot.messageId) {
                outcome.failed++;
                outcome.unresolved.push({ id, reason: 'row has no message_id to fetch' });
                return;
            }

            const message = await this.guildClient.getMessage(
                CommunityChannels.SCREENSHOTS,
                screenshot.messageId,
            );
            const sourceUrl = message.embedImageUrls[0];
            if (!sourceUrl) {
                outcome.failed++;
                outcome.unresolved.push({ id, reason: 'message has no embed image' });
                return;
            }

            if (context.dryRun) {
                outcome.changed++;
                return;
            }

            const { url } = await this.download(key, sourceUrl);
            await this.screenshotRepository.save(
                screenshot.update(undefined, undefined, undefined, undefined, undefined, url),
            );
            outcome.changed++;
        } catch (error: any) {
            outcome.failed++;
            outcome.unresolved.push({ id, reason: error?.message ?? String(error) });
        }
    }

    private async processPopulationB(
        screenshot: Screenshot,
        historyScan: HistoryScan,
        context: JobContext,
        outcome: PopulationOutcome,
    ): Promise<void> {
        outcome.considered++;
        const id = screenshot.id.toString();

        try {
            const key = screenshotMediaKey(id, extensionFromImageUrl(screenshot.image ?? ''));
            if (await this.mediaStorage.exists(key)) {
                outcome.skipped++;
                return;
            }

            const match = historyScan.matches.get(id.toLowerCase());
            if (!match) {
                outcome.failed++;
                outcome.unresolved.push({
                    id,
                    reason: `no message naming this UUID found in the last ${historyScan.scannedMessages} messages scanned (back to ${historyScan.oldestScanned?.toISOString() ?? 'n/a'})`,
                });
                return;
            }

            const sourceUrl = match.attachmentUrls[0];
            if (!sourceUrl) {
                outcome.failed++;
                outcome.unresolved.push({ id, reason: 'matched message has no attachment' });
                return;
            }

            if (context.dryRun) {
                outcome.changed++;
                return;
            }

            const { url } = await this.download(key, sourceUrl);
            // Repairs the M6.2 bug for this row too: the stored message_id
            // was interaction.id (never resolvable); the matched message's
            // own id is the real, correct one.
            await this.screenshotRepository.save(
                screenshot.update(undefined, undefined, undefined, match.id, undefined, url),
            );
            outcome.changed++;
        } catch (error: any) {
            outcome.failed++;
            outcome.unresolved.push({ id, reason: error?.message ?? String(error) });
        }
    }

    /** Downloads `sourceUrl` and uploads it to `key`, returning `{ url }` for the caller to write into the row. */
    private async download(key: string, sourceUrl: string): Promise<{ url: string }> {
        const { bytes, contentType } = await this.imageFetcher.fetch(sourceUrl);
        const url = await this.mediaStorage.put({ key, body: bytes, contentType });
        return { url };
    }

    /**
     * Pages backwards through `#screenshots` looking for a message whose
     * content names one of `targetIds`, stopping once every target has been
     * found or `maxHistoryPages` is exhausted — whichever comes first, so a
     * run with only a couple of unmatched population-B rows left doesn't
     * pay for the full bound every time.
     */
    private async scanHistoryForUuids(targetIds: string[]): Promise<HistoryScan> {
        const targets = new Set(targetIds.map((id) => id.toLowerCase()));
        const matches = new Map<string, CommunityMessage>();
        const unmatchedMessageIds: string[] = [];
        let before: string | undefined;
        let scannedMessages = 0;
        let oldestScanned: Date | undefined;

        for (let page = 0; page < this.maxHistoryPages && matches.size < targets.size; page++) {
            const messages = await this.guildClient.listMessages(CommunityChannels.SCREENSHOTS, {
                before,
                limit: HISTORY_PAGE_SIZE,
            });
            if (messages.length === 0) {
                break;
            }

            for (const message of messages) {
                scannedMessages++;
                oldestScanned = message.createdAt;

                const uuidMatch = UUID_PATTERN.exec(message.content);
                if (!uuidMatch) {
                    continue;
                }

                const uuid = uuidMatch[1]!.toLowerCase();
                if (targets.has(uuid)) {
                    matches.set(uuid, message);
                } else {
                    unmatchedMessageIds.push(message.id);
                }
            }

            before = messages[messages.length - 1]!.id;
            await sleep(this.throttleMs);
        }

        return { matches, unmatchedMessageIds, scannedMessages, oldestScanned };
    }
}
