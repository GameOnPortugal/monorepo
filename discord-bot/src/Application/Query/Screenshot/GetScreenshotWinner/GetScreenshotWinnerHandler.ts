import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { ScreenshotRepository } from '../../../../Domain/Screenshot/ScreenshotRepository';
import { GetScreenshotWinner } from './GetScreenshotWinner';
import { Screenshot } from '../../../../Domain/Screenshot/Screenshot';
import type { GuildClient } from '../../../../Domain/Community/GuildClient.ts';
import { CustomEmoji } from '../../../../Domain/Community/CustomEmoji.ts';
import { CommunityChannels } from '../../../../Domain/Community/CommunityChannels.ts';

export interface ScreenshotWinner {
    screenshot: Screenshot;
    reactionCount: number;
    messageUrl: string;
}

export interface ScreenshotWinnerResult {
    winner: ScreenshotWinner | null;
    /** How many screenshots were found for the week, before any were skipped. */
    candidateCount: number;
    /**
     * How many candidates were skipped because their Discord message no
     * longer exists (deleted by the author, a moderator, or Discord itself)
     * or otherwise could not be evaluated. Counted so a run can be judged
     * honest without digging through logs, never treated as a failure.
     */
    skippedCount: number;
}

/**
 * Deterministic tie-break: the screenshot with the most reactions wins. On an
 * exact tie, the one posted **first** wins — "first to post" is the
 * defensible, unambiguous rule; anything based on iteration/DB order is not
 * guaranteed stable across runs. If two screenshots somehow share the exact
 * same `createdAt` (millisecond collision), fall back to comparing IDs so the
 * result is still deterministic rather than "whatever order they came back
 * in".
 */
function isBetterCandidate(candidate: ScreenshotWinner, current: ScreenshotWinner): boolean {
    if (candidate.reactionCount !== current.reactionCount) {
        return candidate.reactionCount > current.reactionCount;
    }

    const candidateCreatedAt = candidate.screenshot.createdAt.getTime();
    const currentCreatedAt = current.screenshot.createdAt.getTime();
    if (candidateCreatedAt !== currentCreatedAt) {
        return candidateCreatedAt < currentCreatedAt;
    }

    return candidate.screenshot.id.toString() < current.screenshot.id.toString();
}

@injectable()
export class GetScreenshotWinnerHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.ScreenshotRepository)
        private readonly screenshotRepository: ScreenshotRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
    ) {}

    public async handle(command: GetScreenshotWinner): Promise<ScreenshotWinnerResult> {
        const screenshots = await this.screenshotRepository.findByWeek(command.week);

        if (screenshots.length === 0) {
            this.logger.info('No screenshots found for this week');
            return { winner: null, candidateCount: 0, skippedCount: 0 };
        }

        this.logger.info('Found screenshots for this week', { count: screenshots.length });

        let winner: ScreenshotWinner | null = null;
        let skippedCount = 0;

        for (const screenshot of screenshots) {
            if (screenshot.messageId === null) {
                this.logger.info('Skipping screenshot with no message ID', {
                    screenshotId: screenshot.id.toString(),
                });
                skippedCount++;
                continue;
            }

            let candidate: ScreenshotWinner;
            try {
                const reactionCount = await this.guildClient.getTotalReactionsByEmoji(
                    CommunityChannels.SCREENSHOTS,
                    screenshot.messageId,
                    CustomEmoji.TROPHY_PLAT,
                );
                const messageUrl = await this.guildClient.getMessageUrl(
                    CommunityChannels.SCREENSHOTS,
                    screenshot.messageId,
                );
                candidate = { screenshot, reactionCount, messageUrl };
            } catch (error: any) {
                // The message (or its reactions) is gone — deleted by the
                // author, a moderator, or Discord itself. This is expected
                // background noise for 624 screenshots accumulated over
                // sixteen months, not an operational failure: skip quietly,
                // count it, and keep evaluating the remaining candidates.
                this.logger.info('Skipping screenshot with a vanished message', {
                    screenshotId: screenshot.id.toString(),
                    messageId: screenshot.messageId,
                    error: error.message,
                });
                skippedCount++;
                continue;
            }

            if (winner === null || isBetterCandidate(candidate, winner)) {
                winner = candidate;
            }
        }

        if (!winner) {
            this.logger.info('No winner found', {
                candidateCount: screenshots.length,
                skippedCount,
            });
            return { winner: null, candidateCount: screenshots.length, skippedCount };
        }

        this.logger.info('Found winner', {
            screenshotId: winner.screenshot.id.toString(),
            authorId: winner.screenshot.authorId,
            reactionCount: winner.reactionCount,
            candidateCount: screenshots.length,
            skippedCount,
        });

        return { winner, candidateCount: screenshots.length, skippedCount };
    }
}
