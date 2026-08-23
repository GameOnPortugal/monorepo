import type { DiscordProfile } from './DiscordProfile.ts';

export interface DiscordProfileRepository {
    save(profile: DiscordProfile): Promise<void>;

    find(discordId: string): Promise<DiscordProfile | null>;

    /**
     * Every author id that has posted a screenshot or an ad — the population
     * DiscordProfilesSyncJob has to keep names and avatars for. Distinct, so
     * 624 screenshots from 83 people is 83 Discord calls, not 624.
     */
    findAuthorIdsNeedingProfile(): Promise<string[]>;

    /**
     * Author ids from `findAuthorIdsNeedingProfile()` whose profile row is
     * missing or older than `staleBefore`, stalest (and never-synced) first,
     * capped at `limit`. Ordering by staleness is what makes a bounded run
     * make progress instead of re-fetching the same rows every night.
     */
    findStaleAuthorIds(staleBefore: Date, limit: number): Promise<string[]>;

    /**
     * GDPR erasure (M9.7's `/privacidade apagar`): a member who erases their
     * data must not leave a cached copy of their name and picture behind.
     */
    delete(discordId: string): Promise<void>;
}
