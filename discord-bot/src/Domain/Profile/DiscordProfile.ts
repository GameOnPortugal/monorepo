/**
 * The cached Discord identity behind an `author_id` — see the
 * `DiscordProfile` model's doc comment in prisma/schema.prisma for why this
 * is one row per member rather than columns on `screenshots`.
 */
export interface DiscordProfileArray {
    discordId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    avatarHash: string | null;
    syncedAt: Date;
}

export class DiscordProfile {
    constructor(
        public readonly discordId: string,
        public readonly username: string,
        public readonly displayName: string | null,
        /** Re-hosted (MinIO) URL, never a cdn.discordapp.com one. */
        public readonly avatarUrl: string | null,
        /** Discord's hash for whatever `avatarUrl` currently holds. */
        public readonly avatarHash: string | null,
        public readonly syncedAt: Date,
    ) {}

    /**
     * What a public page should call this member. Discord itself resolves a
     * display name this way, and it is what the community actually reads in
     * the channel the screenshot was posted in.
     */
    get preferredName(): string {
        return this.displayName ?? this.username;
    }

    static fromArray(row: DiscordProfileArray): DiscordProfile {
        return new DiscordProfile(
            row.discordId,
            row.username,
            row.displayName,
            row.avatarUrl,
            row.avatarHash,
            row.syncedAt,
        );
    }

    toArray(): DiscordProfileArray {
        return {
            discordId: this.discordId,
            username: this.username,
            displayName: this.displayName,
            avatarUrl: this.avatarUrl,
            avatarHash: this.avatarHash,
            syncedAt: this.syncedAt,
        };
    }
}
