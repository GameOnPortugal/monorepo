import {inject, injectable} from "inversify";
import type CommandHandler from "../../../../Domain/Command/CommandHandler";
import {TYPES} from "../../../../Infrastructure/DependencyInjection/types";
import type Logger from "../../../Logger/Logger";
import {GetRank, type MonthOption} from "./GetRank";
import type {TrophyRepository} from "../../../../Domain/Trophy/TrophyRepository";
import type {TrophyRankData} from "../../../../Domain/Trophy/TrophyRankData";
import type {UserPosition} from "../../../../Domain/Trophy/UserPosition";

@injectable()
export class GetRankHandler implements CommandHandler<GetRank> {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.TrophyRepository) private readonly trophyRepository: TrophyRepository
    ) {}

    public async handle(command: GetRank): Promise<TrophyRankData[] | UserPosition> {
        this.logger.info('Getting trophy rank', {
            type: command.type,
            userId: command.targetUserId,
            limit: command.limit,
            month: command.month,
            year: command.year
        });

        if (command.type === 'user') {
            return await this.getUserPositions(command.targetUserId, command.limit);
        }

        const date = command.type === 'monthly' ? this.getDateForMonth(command.month, command.year) : new Date();
        
        switch (command.type) {
            case 'monthly':
                return await this.trophyRepository.getTopMonthlyHunters(command.limit, date);
            case 'creation':
                return await this.trophyRepository.getTopSinceCreationHunters(command.limit);
            case 'lifetime':
                return await this.trophyRepository.getTopLifetimeHunters(command.limit);
            default:
                throw new Error(`Invalid rank type: ${command.type}`);
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
