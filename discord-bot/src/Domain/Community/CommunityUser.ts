/**
 * A Discord user as the bot reads them back off the API (M10.4).
 *
 * Deliberately the discord.js-free, port-level shape — `Domain/Community`
 * stays framework-free, so `DiscordGuildClient` is the only place that knows
 * an `APIUser` has `global_name` while a `ChatInputCommandInteraction`'s
 * `user` has `globalName`.
 *
 * `avatarHash` is Discord's own hash, not a URL: building the CDN URL needs
 * the user id in the path, and the only thing that is ever allowed to do
 * that is the code re-hosting the image into MediaStorage. Everything
 * downstream sees the re-hosted URL. Null means the member has no custom
 * avatar (Discord serves a generated default) — a real state, not a failure.
 */
export interface CommunityUser {
    id: string;
    /** Discord's unique handle, e.g. `luis`. Always present. */
    username: string;
    /** The global display name, if set. Null means "display the username". */
    displayName: string | null;
    avatarHash: string | null;
}
