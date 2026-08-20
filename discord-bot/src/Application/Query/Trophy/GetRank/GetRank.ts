import type Command from '../../../../Domain/Command/Command';

export type RankType = 'monthly' | 'creation' | 'lifetime' | 'user';
export type MonthOption = 'current' | 'last' | number; // 1-12 for specific months

export class GetRank implements Command {
    constructor(
        public readonly type: RankType,
        public readonly targetUserId: string,
        public readonly limit: number,
        public readonly month?: MonthOption,
        public readonly year?: number,
        // M7.6 — 1-indexed page for the list-shaped rank types (monthly /
        // creation / lifetime). Appended, not inserted, so every pre-M7.6
        // positional `new GetRank(...)` call site keeps compiling.
        // `GetRankHandler` clamps this into range; it is never trusted as
        // already valid (it can arrive decoded from a pagination button's
        // custom ID, which is untrusted input — see CustomId.ts).
        public readonly page: number = 1,
    ) {}
}
