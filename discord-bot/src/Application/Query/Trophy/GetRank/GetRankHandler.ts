import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import { GetRank, type MonthOption } from './GetRank';
import type { TrophyRepository } from '../../../../Domain/Trophy/TrophyRepository';
import type { RankPage } from '../../../../Domain/Trophy/RankPage';
import type { UserPosition } from '../../../../Domain/Trophy/UserPosition';

@injectable()
export class GetRankHandler implements CommandHandler<GetRank> {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.TrophyRepository) private readonly trophyRepository: TrophyRepository,
    ) {}

    public async handle(command: GetRank): Promise<RankPage | UserPosition> {
        this.logger.info('Getting trophy rank', {
            type: command.type,
            userId: command.targetUserId,
            limit: command.limit,
            month: command.month,
            year: command.year,
            page: command.page,
        });

        if (command.type === 'user') {
            return await this.getUserPositions(command.targetUserId, command.limit);
        }

        const date =
            command.type === 'monthly'
                ? this.getDateForMonth(command.month, command.year)
                : new Date();

        const pageSize = Math.max(1, Math.trunc(command.limit));
        const totalCount = await this.countForType(command.type, date);
        // Always at least 1: an empty leaderboard is "page 1 of 1, no
        // rows", never "page 1 of 0" — a caller building Prev/Next buttons
        // never has to special-case a zero-page result.
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        // The requested page is never trusted as in-range — it can arrive
        // decoded straight from a pagination button's custom ID, which may
        // have been generated against a leaderboard that has since shrunk
        // (a profile got excluded, a month rolled over). Clamping here,
        // once, is what lets every caller render whatever page comes back
        // without its own bounds check.
        const page = Math.min(Math.max(1, Math.trunc(command.page)), totalPages);
        const offset = (page - 1) * pageSize;

        const data = await this.fetchForType(command.type, date, pageSize, offset);

        return { data, page, pageSize, totalPages, totalCount };
    }

    private async countForType(type: GetRank['type'], date: Date): Promise<number> {
        switch (type) {
            case 'monthly':
                return this.trophyRepository.countMonthlyHunters(date);
            case 'creation':
                return this.trophyRepository.countSinceCreationHunters();
            case 'lifetime':
                return this.trophyRepository.countLifetimeHunters();
            default:
                throw new Error(`Invalid rank type: ${type}`);
        }
    }

    private async fetchForType(
        type: GetRank['type'],
        date: Date,
        limit: number,
        offset: number,
    ): Promise<RankPage['data']> {
        switch (type) {
            case 'monthly':
                return this.trophyRepository.getTopMonthlyHunters(limit, date, offset);
            case 'creation':
                return this.trophyRepository.getTopSinceCreationHunters(limit, offset);
            case 'lifetime':
                return this.trophyRepository.getTopLifetimeHunters(limit, offset);
            default:
                throw new Error(`Invalid rank type: ${type}`);
        }
    }

    private async getUserPositions(userId: string, limit: number): Promise<UserPosition> {
        return await this.trophyRepository.findUserPosition(userId);
    }

    private getDateForMonth(month?: MonthOption, year?: number): Date {
        const now = new Date();
        const targetYear = year || now.getFullYear();

        if (!month || month === 'current') {
            return new Date(targetYear, now.getMonth());
        }

        if (month === 'last') {
            const lastMonth = new Date(now);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            return new Date(targetYear, lastMonth.getMonth());
        }

        if (!isNaN(month) && month >= 1 && month <= 12) {
            return new Date(targetYear, month - 1);
        }

        return new Date(targetYear, now.getMonth());
    }
}
