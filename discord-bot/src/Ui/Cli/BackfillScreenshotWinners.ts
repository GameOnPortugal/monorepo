import { inject, injectable } from 'inversify';
import dayjs from 'dayjs';
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand';
import { TYPES } from '../../Infrastructure/DependencyInjection/types';
import type { GuildClient } from '../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../Domain/Community/CommunityChannels';
import type { ScreenshotRepository } from '../../Domain/Screenshot/ScreenshotRepository';
import { parseWinnerAnnouncement } from '../../Domain/Screenshot/WinnerAnnouncement';
import { weekWindowContaining } from '../../Domain/Screenshot/ScreenshotWeekWindow';
import CommandHandlerManager from '../../Infrastructure/CommandHandler/CommandHandlerManager';
import { RecordWeeklyWinner } from '../../Application/Write/Screenshot/RecordWeeklyWinner/RecordWeeklyWinner';
import type Logger from '../../Application/Logger/Logger';
import { sleep } from '../../Application/Shared/sleep';

/** Discord caps a history page at 100 regardless of what is asked for. */
const HISTORY_PAGE_SIZE = 100;

/**
 * `#screenshots` goes back to 2021 and has had roughly one winner
 * announcement a week plus every submission in between. 60 pages = 6,000
 * messages, which comfortably covers the whole channel; the scan stops early
 * when Discord runs out of history anyway, so this is a runaway guard rather
 * than a real limit.
 */
const DEFAULT_MAX_PAGES = 60;

/** Extra pacing on top of the REST client's own rate limiter — same as RelinkScreenshotsJob's. */
const THROTTLE_MS = 150;

export interface BackfillWinnersArgs {
    apply: boolean;
    maxPages: number;
}

export function parseBackfillWinnersArgs(inputArgs: unknown): BackfillWinnersArgs {
    const args = Array.isArray(inputArgs)
        ? inputArgs.filter((arg) => arg !== undefined && arg !== null).map((arg) => String(arg))
        : [];

    let apply = false;
    let maxPages = DEFAULT_MAX_PAGES;

    for (const raw of args) {
        if (raw === '--apply') {
            apply = true;
        } else if (raw.startsWith('--max-pages=')) {
            const parsed = Number(raw.slice('--max-pages='.length));
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error(`Invalid --max-pages value: "${raw}"`);
            }
            maxPages = Math.trunc(parsed);
        } else {
            throw new Error(
                `Unknown argument "${raw}". Usage: screenshots:backfill-winners [--max-pages=N] [--apply]`,
            );
        }
    }

    return { apply, maxPages };
}

interface BackfillCounts {
    scannedMessages: number;
    announcementsFound: number;
    /** Announcements whose winning message maps to no screenshot row. */
    unresolved: number;
    /** Weeks written (or that would be written). */
    recorded: number;
    /** Announcements dropped because a later one already claimed the same week. */
    duplicateWeeks: number;
}

/**
 * M10.7 — reconstructs the screenshot contest's history from the
 * announcements still sitting in `#screenshots`.
 *
 * **Dry by default.** Prints what it would write; `--apply` performs the
 * writes. This reads five years of a public channel and creates rows that a
 * public web page will present as community history, so seeing the parse
 * before trusting it is the point.
 *
 * Why parse announcements rather than recompute winners from today's
 * reaction counts (GLOBAL-PLAN M10, finding 3): reactions kept accumulating
 * after each contest closed, so recomputing would retroactively hand old
 * weeks to whoever has gathered the most 🏆 since — a different, wrong
 * answer that would look authoritative. The announcement is what was
 * actually declared at the time.
 *
 * Both announcement formats are handled — see
 * `Domain/Screenshot/WinnerAnnouncement.ts`. Rows land with
 * `source: 'inferred'`, and never overwrite a row the live job wrote
 * (`RecordWeeklyWinnerHandler`).
 *
 * The week is taken from the **winning screenshot's** `createdAt`, not the
 * announcement's timestamp: a screenshot belongs to the contest week it was
 * posted in by definition, whereas an announcement is only *usually* posted
 * the same night the week closed — the old bot's schedule is not recorded
 * anywhere, and a late run would silently shift a week.
 *
 * Newest-first, like the channel: if two announcements somehow claim the same
 * week (a re-run, a correction), the **newest wins** and the older is
 * counted as a duplicate rather than overwriting it.
 */
@injectable()
export default class BackfillScreenshotWinners implements ConsoleCommand {
    public static commandName = 'screenshots:backfill-winners';

    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.ScreenshotRepository)
        private readonly screenshotRepository: ScreenshotRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    configureArgs(_inputArgs: unknown): void {}

    public async run(inputArgs: unknown): Promise<number> {
        const { apply, maxPages } = parseBackfillWinnersArgs(inputArgs);

        this.logger.info('Scanning #screenshots for past winner announcements', {
            apply,
            maxPages,
        });

        const counts: BackfillCounts = {
            scannedMessages: 0,
            announcementsFound: 0,
            unresolved: 0,
            recorded: 0,
            duplicateWeeks: 0,
        };
        const claimedWeeks = new Set<string>();

        let before: string | undefined;

        for (let page = 0; page < maxPages; page++) {
            const messages = await this.guildClient.listMessages(CommunityChannels.SCREENSHOTS, {
                limit: HISTORY_PAGE_SIZE,
                ...(before ? { before } : {}),
            });

            if (messages.length === 0) {
                break;
            }

            counts.scannedMessages += messages.length;
            before = messages[messages.length - 1]?.id;

            for (const message of messages) {
                // Only the bot ever announces a winner. Without this, a member
                // quoting an old announcement (or congratulating someone with
                // a permalink) would be parsed as one.
                if (!message.authorIsBot) continue;

                const parsed = parseWinnerAnnouncement(message.content);
                if (parsed === null) continue;

                counts.announcementsFound++;

                const screenshot = await this.screenshotRepository.findByMessageId(
                    parsed.winningMessageId,
                );

                if (screenshot === null) {
                    // The announcement survives but the screenshot row does
                    // not — deleted by its author, or by M9.7's erasure. There
                    // is nothing to point a Hall of Fame entry at, so this is
                    // reported rather than recorded as a winner with no image.
                    counts.unresolved++;
                    this.logger.info('Winner announcement resolves to no screenshot row', {
                        announcementMessageId: message.id,
                        winningMessageId: parsed.winningMessageId,
                    });
                    continue;
                }

                const window = weekWindowContaining(screenshot.createdAt);
                const weekKey = window.start.toISOString();

                if (claimedWeeks.has(weekKey)) {
                    counts.duplicateWeeks++;
                    this.logger.info('Skipping an older announcement for an already-claimed week', {
                        weekStart: window.start,
                        announcementMessageId: message.id,
                    });
                    continue;
                }
                claimedWeeks.add(weekKey);

                const week = dayjs(window.start).format('YYYY-MM-DD');
                console.log(
                    `${apply ? 'recording' : 'would record'} week ${week}: ` +
                        `"${screenshot.name ?? 'sem nome'}" by ${parsed.authorId ?? screenshot.authorId ?? 'unknown'}` +
                        `${parsed.voteCount === null ? '' : ` (${parsed.voteCount} reações)`}`,
                );

                if (apply) {
                    await this.commandHandlerManager.handle(
                        new RecordWeeklyWinner(
                            screenshot.id.toString(),
                            parsed.authorId ?? screenshot.authorId,
                            window.start,
                            window.end,
                            parsed.voteCount,
                            await this.messageUrlFor(parsed.winningMessageId),
                            message.id,
                            'inferred',
                        ),
                    );
                }

                counts.recorded++;
            }

            await sleep(THROTTLE_MS);
        }

        this.logger.info(apply ? 'Winner backfill complete' : 'Winner backfill dry run complete', {
            ...counts,
        });
        console.log(
            `\nScanned ${counts.scannedMessages} messages · ` +
                `${counts.announcementsFound} announcements · ` +
                `${counts.recorded} weeks ${apply ? 'recorded' : 'to record'} · ` +
                `${counts.unresolved} unresolved · ${counts.duplicateWeeks} duplicate weeks`,
        );
        if (!apply) {
            console.log('Dry run — nothing was written. Re-run with --apply to persist.');
        }

        return 0;
    }

    /**
     * The permalink stored on the row. Rebuilt through the client rather than
     * reused from the announcement text so it is normalised the same way
     * every other stored message URL is; a message that has since been
     * deleted simply stores no URL rather than failing the whole backfill.
     */
    private async messageUrlFor(messageId: string): Promise<string | null> {
        try {
            return await this.guildClient.getMessageUrl(CommunityChannels.SCREENSHOTS, messageId);
        } catch {
            return null;
        }
    }
}
