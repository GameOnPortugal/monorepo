import { prisma } from "../db";

// M10.5 — turning an `author_id` into something a public page may show.
//
// Every public response that credits somebody goes through here, so there is
// exactly one place that decides what "crediting a member" means and exactly
// one place that has to stay true to the privacy page.
//
// **What crosses the boundary**: a display name and a re-hosted avatar URL.
// **What never does**: `author_id`, `channel_id`, `message_id` — the same
// rule repositories/ads.ts and repositories/screenshots.ts have always
// stated. Those are join keys and internal identifiers; publishing them
// invites clients to depend on them and puts a raw Discord snowflake on an
// indexable page. `messageUrl` is *derived* from two of them and returned in
// their place, which is the honest half: the permalink is what makes the
// credit verifiable rather than a claim the portal invents.
//
// Luis settled the underlying question on 2026-08-22
// (docs/plans/09-portal-community-identity.md decision 1): names go on the
// public page, and — reversing that decision's option C — avatars do too,
// on the condition they are re-hosted rather than hot-linked. The bot does
// that re-hosting (see the `DiscordProfile` model in
// discord-bot/prisma/schema.prisma); this file only ever reads the result.
//
// The `publicOptOut` filter in visibility.ts is untouched and still runs
// first: an opted-out member's screenshots never reach this code, because
// the rows are already gone from the query.

/** The public shape of "who made this". */
export interface PublicAuthor {
  /** Their Discord display name, or handle when they have not set one. */
  name: string;
  /** Re-hosted (media.game-on-portugal.pt) avatar, or null for the monogram fallback. */
  avatarUrl: string | null;
}

/**
 * The community guild id, needed to build a `discord.com/channels/...`
 * permalink. Defaults to the same verified constant the bot has hardcoded in
 * `discord-bot/src/Infrastructure/Community/Discord/DiscordChannels.ts`
 * (`DISCORD_IDS_DEFAULTS.GUILD_ID`), so this works with no extra
 * configuration and stays overridable if the community ever moves.
 *
 * A guild id is not a secret — it is in the URL of every message anyone has
 * ever linked — so hardcoding a default here leaks nothing that the
 * permalinks themselves do not already contain.
 */
const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "818108848492773377";

/**
 * The Discord permalink for a message, or null when either half is missing.
 *
 * Production has no screenshot with a null `message_id` (verified
 * 2026-08-22), but ads do — the M0.1 orphan rows — so this stays defensive
 * rather than assuming.
 */
export function messageUrl(channelId: string | null, messageId: string | null): string | null {
  if (!channelId || !messageId) return null;
  return `https://discord.com/channels/${GUILD_ID}/${channelId}/${messageId}`;
}

/**
 * Names and avatars for a page's worth of author ids, as a lookup.
 *
 * One query for the whole page, not one per row: a gallery page of 60 tiles
 * is typically a handful of distinct people, and the alternative (a Prisma
 * relation) would need a real foreign key on `screenshots.author_id`, which
 * deliberately does not exist — see the `DiscordProfile` model's doc comment
 * for why.
 *
 * An id with no profile row is simply absent from the map. That is a normal
 * state, not an error: a member whose profile the bot's sync job has not
 * reached yet, or whose Discord account is gone. The caller renders the
 * screenshot uncredited rather than hiding it — hiding it would make the
 * gallery's own count lie, the same rule screenshots.ts already applies to a
 * missing image.
 */
export async function loadAuthors(authorIds: (string | null)[]): Promise<Map<string, PublicAuthor>> {
  const ids = [...new Set(authorIds.filter((id): id is string => id !== null && id !== ""))];
  if (ids.length === 0) return new Map();

  const rows = await prisma.discordProfile.findMany({
    where: { discordId: { in: ids } },
    select: { discordId: true, username: true, displayName: true, avatarUrl: true },
  });

  return new Map(
    rows.map((row) => [
      row.discordId,
      // Same precedence as the bot's `DiscordProfile.preferredName`, and the
      // same thing Discord itself shows in the channel the screenshot was
      // posted in.
      { name: row.displayName ?? row.username, avatarUrl: row.avatarUrl },
    ]),
  );
}
