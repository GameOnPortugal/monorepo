import { prisma } from "../db";
import { loadAuthors, messageUrl, type PublicAuthor } from "./credit";
import { publicScreenshotsWhere } from "./visibility";

// M10.8 — the Hall of Fame's data, at last.
//
// Until the bot started persisting winners (M10.7) this page was a
// placeholder that said so, because a weekly winner existed only as a
// Discord message: reaction counts were read live, announced, and never
// written down. `screenshot_winners` is now that history, including 137
// weeks recovered from announcements still in `#screenshots` going back to
// 2021 (verified against production 2026-08-22).
//
// Two honesty rules this file enforces, both of which matter more than the
// page looking full:
//
//  1. **A winner whose screenshot is no longer publicly visible is not
//     returned.** The winner row is denormalised and survives the screenshot
//     being deleted or its author opting out — deliberately, so the contest's
//     history is not rewritten — but the *portal* must not show a member's
//     content after they opted out of public visibility. So the join back to
//     `screenshots` goes through the same `publicScreenshotsWhere` filter
//     every other public read uses, and a week whose screenshot does not
//     survive that filter simply does not appear.
//  2. **`source` is passed through, never smoothed over.** An `inferred` row
//     is a faithful copy of what was announced, but only for announcements
//     that still exist — and only for weeks that were announced at all. The
//     2026-08-23 backfill found 139 announcements and recovered 137 weeks;
//     the remaining 2 named screenshots the old bot had itself deleted, and
//     any week whose announcement was removed is simply absent. The page
//     marks reconstructed entries rather than implying the history is
//     complete. Every recovered row also has a **null `voteCount`** — the old
//     announcement format never stated one, and the UI omits the number
//     rather than printing "0 votos" for a week somebody genuinely won.

export interface PublicWinner {
  weekStart: Date;
  weekEnd: Date;
  voteCount: number | null;
  source: string;
  screenshot: {
    id: string;
    name: string | null;
    platform: string | null;
    imageUrl: string | null;
    createdAt: Date;
    messageUrl: string | null;
  };
  author: PublicAuthor | null;
}

/**
 * Every decided week whose screenshot is still publicly visible, newest
 * first. Not paginated: this is at most one row per week since 2021 (137
 * today), and the page shows them as a single gallery.
 */
export async function listWinners(limit: number): Promise<PublicWinner[]> {
  // `take` cannot be applied to the query above: a winner near the top of
  // `weekStart desc` order can still be dropped by `publicScreenshotsWhere`
  // below (deleted screenshot, opted-out author), and taking `limit` rows
  // before that filter runs would let a hidden recent week silently displace
  // an older, still-visible one instead of just not appearing. The full
  // history is at most one row per week since 2021 (137 today, see the
  // module doc comment), so fetching it all and slicing after filtering is
  // cheap.
  const winners = await prisma.screenshotWinner.findMany({
    orderBy: { weekStart: "desc" },
  });

  if (winners.length === 0) return [];

  const screenshots = await prisma.screenshot.findMany({
    where: await publicScreenshotsWhere({ id: { in: winners.map((winner) => winner.screenshotId) } }),
  });

  const byId = new Map(screenshots.map((screenshot) => [screenshot.id, screenshot]));
  const authors = await loadAuthors(screenshots.map((screenshot) => screenshot.author_id));

  return winners
    .flatMap((winner) => {
      const screenshot = byId.get(winner.screenshotId);
      if (!screenshot) return [];

      return [
        {
          weekStart: winner.weekStart,
          weekEnd: winner.weekEnd,
          voteCount: winner.voteCount,
          source: winner.source,
          screenshot: {
            id: screenshot.id,
            name: screenshot.name,
            platform: screenshot.plataform,
            imageUrl: screenshot.image,
            createdAt: screenshot.createdAt,
            messageUrl: messageUrl(screenshot.channel_id, screenshot.message_id),
          },
          author: (screenshot.author_id ? authors.get(screenshot.author_id) : undefined) ?? null,
        },
      ];
    })
    .slice(0, limit);
}

export async function countWinners(): Promise<number> {
  return prisma.screenshotWinner.count();
}
