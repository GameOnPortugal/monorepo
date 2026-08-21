import type Command from '../../../../Domain/Command/Command.ts';

export class SetPrivacyOptOut implements Command {
    constructor(
        public readonly discordId: string,
        public readonly optOut: boolean,
    ) {}
}
