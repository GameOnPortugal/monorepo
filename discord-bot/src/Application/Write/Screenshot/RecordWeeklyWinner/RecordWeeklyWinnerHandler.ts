import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { RecordWeeklyWinner } from './RecordWeeklyWinner';
import { WeeklyWinner } from '../../../../Domain/Screenshot/WeeklyWinner';
import type { WeeklyWinnerRepository } from '../../../../Domain/Screenshot/WeeklyWinnerRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';

/**
 * Writes (or updates) the one row a decided contest week gets.
 *
 * An `announced` row never loses to an `inferred` one. The backfill parses
 * the very announcements the live job posted, so re-running it after a few
 * normal weeks would otherwise downgrade authoritative rows to "inferred"
 * and make the portal's disclaimer lie about data it actually has
 * first-hand. Upgrading in the other direction is allowed: a week first
 * recovered from history and then re-announced is genuinely authoritative.
 */
@injectable()
export class RecordWeeklyWinnerHandler implements CommandHandler<RecordWeeklyWinner> {
    constructor(
        @inject(TYPES.WeeklyWinnerRepository)
        private readonly weeklyWinnerRepository: WeeklyWinnerRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: RecordWeeklyWinner): Promise<WeeklyWinner | null> {
        const existing = await this.weeklyWinnerRepository.findByWeekStart(command.weekStart);

        if (existing !== null && existing.source === 'announced' && command.source === 'inferred') {
            this.logger.info('Keeping the announced winner for this week over an inferred one', {
                weekStart: command.weekStart,
                keptScreenshotId: existing.screenshotId,
            });
            return existing;
        }

        const winner = new WeeklyWinner(
            existing?.id ?? randomUUID(),
            command.screenshotId,
            command.authorId,
            command.weekStart,
            command.weekEnd,
            command.voteCount,
            command.messageUrl,
            command.announcementMessageId,
            command.source,
        );

        await this.weeklyWinnerRepository.save(winner);

        this.logger.info('Weekly screenshot winner recorded', {
            weekStart: winner.weekStart,
            screenshotId: winner.screenshotId,
            source: winner.source,
            voteCount: winner.voteCount,
        });

        return winner;
    }
}
