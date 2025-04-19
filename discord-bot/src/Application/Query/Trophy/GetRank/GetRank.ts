import type Command from "../../../../Domain/Command/Command";

export type RankType = 'monthly' | 'creation' | 'lifetime' | 'user';
export type MonthOption = 'current' | 'last' | number; // 1-12 for specific months

export class GetRank implements Command {
    constructor(
        public readonly type: RankType,
        public readonly targetUserId: string,
        public readonly limit: number,
        public readonly month?: MonthOption,
        public readonly year?: number,
    ) {}
}
