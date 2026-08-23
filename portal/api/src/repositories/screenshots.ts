import { prisma } from "../db";
import { loadAuthors, messageUrl, type PublicAuthor } from "./credit";
import { publicScreenshotsWhere } from "./visibility";

// Screenshot gallery. `plataform` (sic — legacy column name, do not "fix" it,
// see AGENT.md "Prisma column names ... do not tidy them") is free text with
// ~21 distinct values; raw value is returned as-is, same normalisation note
// as repositories/ads.ts (GLOBAL-PLAN M8.4).
//
// `image` historically held a Discord CDN URL, which expires (cross-cutting
// rule 3) — that is why all 624 legacy rows 404'd until M6.2/M6.3's relink
// job re-hosted them to MinIO. This repository does not care which kind of
// URL is stored; it just passes through whatever the bot's ingest/relink path
// wrote. A row with a null/empty `image` is still returned — the web client
// is expected to render a placeholder rather than the API hiding the row,
// since hiding it would make the gallery's count lie.
//
// M10.5 — screenshots are now **credited**. `author_id`/`channel_id`/
// `message_id` are still never exposed; what goes out is a display name, a
// re-hosted avatar and a derived `messageUrl`, all built in
// repositories/credit.ts, which is where that boundary is stated in full.
// Plus `winner`, for the weeks the contest was decided (M10.7/M10.8).

export interface ScreenshotWinnerBadge {
  /** Monday that opened the contest week this screenshot won. */
  weekStart: Date;
  weekEnd: Date;
  /** Reactions as announced at the time. Null when the announcement never said. */
  voteCount: number | null;
  /**
   * `announced` — the bot wrote this row as it posted the announcement.
   * `inferred` — recovered from an old announcement in channel history.
   * Surfaced so the Hall of Fame can be honest about which is which rather
   * than presenting reconstructed history as first-hand.
   */
  source: string;
}

export interface PublicScreenshot {
  id: string;
  name: string | null;
  platform: string | null;
  imageUrl: string | null;
  createdAt: Date;
  /** Null when the bot has no cached profile for the author (or there is no author). */
  author: PublicAuthor | null;
  /** Permalink to the Discord message, so the credit is verifiable. */
  messageUrl: string | null;
  /** Set only for a screenshot that won its week. */
  winner: ScreenshotWinnerBadge | null;
}

interface ScreenshotRow {
  id: string;
  name: string | null;
  plataform: string | null;
  image: string | null;
  createdAt: Date;
  author_id: string | null;
  channel_id: string | null;
  message_id: string | null;
}

/**
 * Winner badges for a page's screenshots, keyed by screenshot id — one query
 * for the page, same batching reasoning as `loadAuthors`.
 */
async function loadWinnerBadges(screenshotIds: string[]): Promise<Map<string, ScreenshotWinnerBadge>> {
  if (screenshotIds.length === 0) return new Map();

  const rows = await prisma.screenshotWinner.findMany({
    where: { screenshotId: { in: screenshotIds } },
    select: { screenshotId: true, weekStart: true, weekEnd: true, voteCount: true, source: true },
  });

  return new Map(
    rows.map((row) => [
      row.screenshotId,
      { weekStart: row.weekStart, weekEnd: row.weekEnd, voteCount: row.voteCount, source: row.source },
    ]),
  );
}

async function toPublicScreenshots(rows: ScreenshotRow[]): Promise<PublicScreenshot[]> {
  const [authors, badges] = await Promise.all([
    loadAuthors(rows.map((row) => row.author_id)),
    loadWinnerBadges(rows.map((row) => row.id)),
  ]);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.plataform,
    imageUrl: row.image,
    createdAt: row.createdAt,
    author: (row.author_id ? authors.get(row.author_id) : undefined) ?? null,
    messageUrl: messageUrl(row.channel_id, row.message_id),
    winner: badges.get(row.id) ?? null,
  }));
}

export interface ListScreenshotsFilters {
  platform?: string;
  limit: number;
  offset: number;
}

export async function listScreenshots(filters: ListScreenshotsFilters): Promise<PublicScreenshot[]> {
  const where = await publicScreenshotsWhere(filters.platform ? { plataform: filters.platform } : {});

  const rows = await prisma.screenshot.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit,
    skip: filters.offset,
  });

  return toPublicScreenshots(rows as ScreenshotRow[]);
}

export async function countScreenshots(filters: Pick<ListScreenshotsFilters, "platform">): Promise<number> {
  const where = await publicScreenshotsWhere(filters.platform ? { plataform: filters.platform } : {});
  return prisma.screenshot.count({ where });
}
