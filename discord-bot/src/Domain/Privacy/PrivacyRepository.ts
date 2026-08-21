/**
 * The single source of truth for a member's public-visibility opt-out
 * (M9.7). See `prisma/schema.prisma`'s `PrivacySetting` model doc comment
 * for why this is one row per Discord member rather than a flag duplicated
 * onto `ads`/`screenshots`/`trophyprofiles`.
 *
 * A member who has never called `setOptOut` has no row here at all — that
 * is "opted in" (visible), not an error. `isOptedOut` returning `false` for
 * an unknown member is therefore correct, not a fail-open bug: the
 * fail-closed rule (docs/plans/GLOBAL-PLAN.md M9.7) is about what happens
 * when the *read itself* cannot complete (the database is unreachable, the
 * table is missing, etc.) — that must surface as a thrown error, never as a
 * silent `false`, so a caller on the public read path (the portal) treats a
 * broken check as "hide it", not "show it". This interface documents that
 * contract; `OrmPrivacyRepository` must not catch and swallow.
 */
export interface PrivacyRepository {
    /**
     * @throws whatever the underlying store throws — never caught here. A
     * caller that cannot get a real answer must not treat that as "false".
     */
    isOptedOut(discordId: string): Promise<boolean>;

    /** Upserts the member's row — this is the only write path for the flag. */
    setOptOut(discordId: string, optOut: boolean): Promise<void>;

    /** GDPR erasure support: removes the row entirely, if one exists. Idempotent. */
    delete(discordId: string): Promise<void>;
}
