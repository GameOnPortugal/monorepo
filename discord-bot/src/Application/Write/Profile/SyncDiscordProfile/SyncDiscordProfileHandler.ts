import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { SyncDiscordProfile } from './SyncDiscordProfile';
import { DiscordProfile } from '../../../../Domain/Profile/DiscordProfile';
import type { DiscordProfileRepository } from '../../../../Domain/Profile/DiscordProfileRepository';
import type { GuildClient } from '../../../../Domain/Community/GuildClient';
import type { MediaStorage } from '../../../../Domain/Media/MediaStorage';
import { avatarMediaKey } from '../../../../Domain/Media/MediaKey';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type { SafeImageFetcher } from '../../../../Infrastructure/Media/SafeImageFetcher.ts';

/** Narrowed to the one method this handler calls — see CreateScreenshotHandler.ts for the same pattern. */
export type ImageFetcher = Pick<SafeImageFetcher, 'fetch'>;

/**
 * Discord serves avatars at
 * `cdn.discordapp.com/avatars/<userId>/<hash>.<ext>`. Always requested as
 * PNG at 128px: the portal shows this at 24-32px beside a name, an animated
 * (`a_`-prefixed) avatar would be a needlessly large GIF for that, and one
 * format means one code path and one extension in the storage key.
 */
const AVATAR_SIZE = 128;

function discordAvatarUrl(userId: string, avatarHash: string): string {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=${AVATAR_SIZE}`;
}

export interface SyncDiscordProfileResult {
    profile: DiscordProfile | null;
    /** True when the member's avatar was downloaded and re-hosted on this run. */
    avatarRehosted: boolean;
}

/**
 * M10.4 — writes/refreshes one member's cached name and avatar.
 *
 * The avatar is **re-hosted through MediaStorage**, never linked. Discord's
 * avatar URLs are not signed the way attachment URLs are (cross-cutting rule
 * 3), but they carry the member's raw snowflake in the path — which is
 * exactly what public portal responses must never leak — and they 404 the
 * instant the member changes picture. See the `DiscordProfile` model's doc
 * comment in schema.prisma, and docs/plans/09-portal-community-identity.md
 * decision 1 (whose "no avatars" answer was reversed by Luis on 2026-08-22,
 * on the condition that re-hosting is how it is done).
 *
 * Re-hosting is skipped when the stored `avatarHash` already matches what
 * Discord reports, which is what keeps a nightly refresh over 109 authors
 * down to 109 cheap API calls instead of 109 image downloads.
 *
 * A failed avatar re-host is **not** a failed sync: the name is the part the
 * portal cannot do without, and a member with no picture renders a monogram.
 * The row is saved with whatever avatar it already had (or none) and the
 * failure is logged.
 */
@injectable()
export class SyncDiscordProfileHandler implements CommandHandler<SyncDiscordProfile> {
    constructor(
        @inject(TYPES.DiscordProfileRepository)
        private readonly profileRepository: DiscordProfileRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.MediaStorage) private readonly mediaStorage: MediaStorage,
        @inject(TYPES.SafeImageFetcher) private readonly imageFetcher: ImageFetcher,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: SyncDiscordProfile): Promise<SyncDiscordProfileResult> {
        const user = command.known ?? (await this.guildClient.fetchUser(command.discordId));

        if (user === null) {
            // A deleted Discord account. Deliberately leaves any existing row
            // alone rather than blanking it: the name that was true when the
            // screenshot was posted is still the honest credit for it, and
            // erasure on request is M9.7's job, not this one's.
            this.logger.info(
                'No Discord user behind this author id — leaving the cached profile as-is',
                {
                    discordId: command.discordId,
                },
            );
            return {
                profile: await this.profileRepository.find(command.discordId),
                avatarRehosted: false,
            };
        }

        const existing = await this.profileRepository.find(command.discordId);

        let avatarUrl = existing?.avatarUrl ?? null;
        let avatarHash = existing?.avatarHash ?? null;
        let avatarRehosted = false;

        if (user.avatarHash === null) {
            // The member removed their custom avatar; Discord now serves a
            // generated default keyed by their id, which is not ours to
            // re-host. Drop back to the monogram the portal renders anyway.
            avatarUrl = null;
            avatarHash = null;
        } else if (user.avatarHash !== existing?.avatarHash || existing?.avatarUrl === null) {
            const rehosted = await this.rehostAvatar(user.id, user.avatarHash);
            if (rehosted !== null) {
                avatarUrl = rehosted;
                avatarHash = user.avatarHash;
                avatarRehosted = true;
            }
        }

        const profile = new DiscordProfile(
            user.id,
            user.username,
            user.displayName,
            avatarUrl,
            avatarHash,
            new Date(),
        );
        await this.profileRepository.save(profile);

        this.logger.info('Discord profile synced', {
            discordId: profile.discordId,
            username: profile.username,
            hasAvatar: profile.avatarUrl !== null,
            avatarRehosted,
        });

        return { profile, avatarRehosted };
    }

    /** Returns the durable URL, or null if the picture could not be re-hosted. */
    private async rehostAvatar(userId: string, avatarHash: string): Promise<string | null> {
        try {
            const key = avatarMediaKey(avatarHash, 'png');

            // Same key for the same (member, avatar) on every run, so a
            // re-sync of a row whose object is already stored costs one HEAD
            // instead of a download plus an upload.
            if (await this.mediaStorage.exists(key)) {
                return this.mediaStorage.publicUrlFor(key);
            }

            const { bytes, contentType } = await this.imageFetcher.fetch(
                discordAvatarUrl(userId, avatarHash),
            );
            return await this.mediaStorage.put({ key, body: bytes, contentType });
        } catch (error: any) {
            this.logger.error(
                'Failed to re-host a Discord avatar — keeping the profile without one',
                {
                    discordId: userId,
                    avatarHash,
                    error: error.message,
                },
            );
            return null;
        }
    }
}
