import type Command from '../../../../Domain/Command/Command.ts';

/** GDPR erasure request (M9.7) — a member deleting their own data. */
export class DeleteMemberData implements Command {
    constructor(public readonly discordId: string) {}
}
