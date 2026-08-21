import { prisma } from "../db";

// Shared "is this row allowed to appear in a public response" predicates.
//
// docs/plans/03-portal.md decision 5 / GLOBAL-PLAN M9.7: a member's public
// -visibility opt-out is now real — `PrivacySetting` (table
// `privacy_settings`, discord-bot/prisma/schema.prisma), one row per Discord
// member, keyed by their Discord id. It is deliberately NOT a
// `public_opt_out` column duplicated onto `ads`/`screenshots`/
// `trophyprofiles` (what this file used to say was planned): none of those
// three tables carries a real foreign key to a canonical "user" today, and a
// member's decision to opt out has to cover everything they have ever
// posted from one row, not one this repository would have to remember to
// copy onto every future row. See the `PrivacySetting` model's doc comment
// in schema.prisma for the full reasoning.
//
// FAIL CLOSED: every function below that queries `privacy_settings` does
// not catch. If that query throws (the table is unreachable, whatever), the
// exception must propagate all the way out to the route handler and become
// a 500 — hiding content that should be visible is a bug, showing content
// someone asked to hide is a breach, and of the two only the first is
// recoverable by retrying. No call site in this package may wrap these in a
// try/catch that falls back to an unfiltered query.

// `any` rather than Prisma's generated `AdWhereInput` etc.: these helpers are
// deliberately generic over whichever model calls them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

/**
 * Discord ids of members who have opted out of public visibility. Exported
 * so tests can exercise the fail-closed contract directly (monkeypatch
 * `prisma.privacySetting.findMany` and assert this rejects rather than
 * resolving to `[]`).
 */
export async function optedOutDiscordIds(): Promise<string[]> {
  const rows = await prisma.privacySetting.findMany({
    where: { publicOptOut: true },
    select: { discordId: true },
  });

  return rows.map((row) => row.discordId);
}

/**
 * `column NOT IN (opted-out ids)`, with an explicit `OR column IS NULL` —
 * `author_id` is a nullable legacy column on both `ads` and `screenshots`,
 * and a null author was never attributable to anyone, so it can never match
 * an opt-out row and must stay visible. Relying on Prisma's own null
 * handling for `notIn` was deliberately not trusted here; this is explicit.
 */
function excludingOptedOutAuthors(column: "author_id", optedOut: string[]): Where {
  if (optedOut.length === 0) return {};
  return { OR: [{ [column]: null }, { [column]: { notIn: optedOut } }] };
}

/** Ads visible on the public marketplace pages. */
export async function publicAdsWhere(extra: Where = {}): Promise<Where> {
  const optedOut = await optedOutDiscordIds();

  return {
    AND: [extra, { status: extra.status ?? "active" }, excludingOptedOutAuthors("author_id", optedOut)],
  };
}

/** Screenshots visible in the public gallery. */
export async function publicScreenshotsWhere(extra: Where = {}): Promise<Where> {
  const optedOut = await optedOutDiscordIds();

  return { AND: [extra, excludingOptedOutAuthors("author_id", optedOut)] };
}

/**
 * The trophy leaderboard already excludes banned/left/excluded profiles via
 * `isExcluded` (see OrmTrophyRepository.queryRankedHunters in the bot — that
 * flag is kept as the single source of truth by TrophiesSyncJob, which always
 * sets isExcluded alongside isBanned/hasLeft). `public_opt_out` is a second,
 * independent signal for "don't show me publicly even though I'm a
 * legitimate ranked player" — folded in here as a `NOT IN` subquery rather
 * than a second round trip, since this query is already raw SQL
 * (`repositories/trophies.ts`). `tp.userId IS NULL` is the same
 * never-attributable-so-never-hidden rule as `excludingOptedOutAuthors`
 * above. A broken `privacy_settings` table fails this query outright (fails
 * closed), same contract as the other two functions in this file.
 */
export function publicTrophyProfileFilter(): string {
  return (
    "tp.isExcluded = false AND (tp.userId IS NULL OR tp.userId NOT IN " +
    "(SELECT discordId FROM privacy_settings WHERE publicOptOut = true))"
  );
}
