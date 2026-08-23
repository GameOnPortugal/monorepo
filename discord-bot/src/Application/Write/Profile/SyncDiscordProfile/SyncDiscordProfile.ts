import type Command from '../../../../Domain/Command/Command.ts';
import type { CommunityUser } from '../../../../Domain/Community/CommunityUser.ts';

/**
 * M10.4 — bring the cached `discord_profiles` row for one member up to date.
 *
 * `known` exists for the ingest path: `/screenshot` already holds the
 * submitter's username, display name and avatar hash on the interaction, so
 * passing them here saves a `GET /users/{id}` round trip on every
 * submission. Omit it (the backfill/job path) and the handler fetches them.
 */
export class SyncDiscordProfile implements Command {
    constructor(
        public readonly discordId: string,
        public readonly known?: CommunityUser,
    ) {}
}
