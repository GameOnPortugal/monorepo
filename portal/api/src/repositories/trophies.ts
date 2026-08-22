import { prisma } from "../db";
import { optedOutDiscordIds, publicTrophyProfileFilter } from "./visibility";

// Trophy leaderboard. Mirrors the aggregation/sort in the bot's
// OrmTrophyRepository.queryRankedHunters (discord-bot/src/Infrastructure/Orm/OrmTrophyRepository.ts)
// so the portal's numbers match `/trophy rank` for the same query — this is
// a separate implementation by design (the portal never imports bot
// Application/Domain code, only its generated Prisma client), but the SQL
// shape is intentionally identical:
//
//   - only `trophyprofiles.isExcluded = false` rows count (that flag is the
//     single source of truth TrophiesSyncJob maintains for "banned or left or
//     otherwise excluded" — see repositories/visibility.ts)
//   - INNER JOIN trophies: a profile with zero trophies does not appear at
//     all, it is not a zero-point row
//   - sum(points) / count(*) per profile, tie-broken points DESC, then
//     trophy count DESC, then psnProfile ASC for determinism
//
// docs/plans/00-overview.md: trophy data was frozen since 2024-12-02 until
// GLOBAL-PLAN M7 ported the sync job (M7.1-M7.5/M7.7 landed 2026-08-20); the
// web client should still show an honest "may be behind live Discord" notice
// per M8.9 until M7.6/M7.8 (rank presentation parity, announcements) land —
// that is a page concern (M8.9), not this endpoint's.
//
// Never expose `userId` (a raw Discord id) — privacy decision 5. `psnProfile`
// is the one field this data already treats as a public display name (it is
// exactly what `/trophy rank` shows in Discord today).

export interface LeaderboardEntry {
  rank: number;
  psnProfile: string | null;
  points: number;
  trophyCount: number;
}

interface RawLeaderboardRow {
  psnProfile: string | null;
  points: bigint | number;
  trophyCount: bigint | number;
}

export async function getLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const rows = await prisma.$queryRawUnsafe<RawLeaderboardRow[]>(
    `
      SELECT
        tp.psnProfile AS psnProfile,
        CAST(COALESCE(SUM(t.points), 0) AS SIGNED) AS points,
        CAST(COUNT(t.id) AS SIGNED) AS trophyCount
      FROM trophyprofiles tp
      INNER JOIN trophies t ON t.trophyProfile = tp.id
      WHERE ${publicTrophyProfileFilter()}
      GROUP BY tp.id, tp.psnProfile
      ORDER BY points DESC, trophyCount DESC, tp.psnProfile ASC
      LIMIT ?
    `,
    limit,
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    psnProfile: row.psnProfile,
    points: Number(row.points),
    trophyCount: Number(row.trophyCount),
  }));
}

// ---------------------------------------------------------------------------
// M11 — one hunter's own platinum list, for the portal's hunter detail view.
// ---------------------------------------------------------------------------

export interface HunterTrophy {
  /** The PSNProfiles trophy URL, e.g. `.../trophies/11783-assassins-creed-valhalla/Someone`. */
  url: string | null;
  points: number;
  completionDate: Date | null;
}

export interface Hunter {
  psnProfile: string;
  rank: number;
  points: number;
  trophyCount: number;
  trophies: HunterTrophy[];
}

/**
 * Everything the portal can honestly say about one trophy hunter.
 *
 * The game a trophy belongs to is **not** a column — it is only recoverable
 * from `trophies.url`'s slug (`/trophies/<id>-<game-slug>/<profile>`), which
 * is what `PsnProfilesTrophySource.parseProfileTrophies` captured when the
 * trophy was claimed. That parsing is deliberately left to the client
 * (`portal/web/src/lib/psn.ts`) rather than done here: it is presentation of
 * an already-public URL, it needs no database access, and keeping it
 * client-side means a slug format change is a display bug rather than an API
 * contract change.
 *
 * Same visibility contract as `getLeaderboard` — an excluded or opted-out
 * profile is not found at all, so this endpoint can never be used to look up
 * someone who chose not to appear on the leaderboard.
 */
export async function getHunter(psnProfile: string): Promise<Hunter | null> {
  const optedOut = await optedOutDiscordIds();

  const profile = await prisma.trophyProfile.findFirst({
    where: {
      psnProfile,
      isExcluded: false,
      ...(optedOut.length > 0 ? { OR: [{ userId: null }, { userId: { notIn: optedOut } }] } : {}),
    },
    select: { id: true, psnProfile: true },
  });

  if (!profile?.psnProfile) return null;

  const rows = await prisma.trophies.findMany({
    where: { trophyProfile: profile.id },
    orderBy: [{ completionDate: "desc" }, { createdAt: "desc" }],
    select: { url: true, points: true, completionDate: true },
  });

  // INNER JOIN semantics, same as the leaderboard: a profile with zero
  // trophies is not a zero-point hunter, it is not a hunter.
  if (rows.length === 0) return null;

  const trophies = rows.map((row) => ({
    url: row.url,
    points: row.points ?? 0,
    completionDate: row.completionDate,
  }));
  const points = trophies.reduce((sum, trophy) => sum + trophy.points, 0);

  return {
    psnProfile: profile.psnProfile,
    rank: await rankOf(profile.psnProfile, points, trophies.length),
    points,
    trophyCount: trophies.length,
    trophies,
  };
}

/**
 * The hunter's position in the same ordering `getLeaderboard` uses, computed
 * as "how many profiles sort strictly before this one, plus one".
 *
 * The comparison mirrors that query's `ORDER BY points DESC, trophyCount
 * DESC, psnProfile ASC` exactly, tie-break included — otherwise a hunter's
 * detail page could claim a rank the leaderboard doesn't give them. Counting
 * rather than paginating the whole board keeps this O(profiles) in SQL
 * instead of pulling every hunter over the wire to find one index.
 */
async function rankOf(psnProfile: string, points: number, trophyCount: number): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ better: bigint | number }[]>(
    `
      SELECT CAST(COUNT(*) AS SIGNED) AS better FROM (
        SELECT
          tp.psnProfile AS psnProfile,
          COALESCE(SUM(t.points), 0) AS points,
          COUNT(t.id) AS trophyCount
        FROM trophyprofiles tp
        INNER JOIN trophies t ON t.trophyProfile = tp.id
        WHERE ${publicTrophyProfileFilter()}
        GROUP BY tp.id, tp.psnProfile
      ) ranked
      WHERE ranked.points > ?
         OR (ranked.points = ? AND ranked.trophyCount > ?)
         OR (ranked.points = ? AND ranked.trophyCount = ? AND (ranked.psnProfile IS NULL OR ranked.psnProfile < ?))
    `,
    points,
    points,
    trophyCount,
    points,
    trophyCount,
    psnProfile,
  );

  return Number(rows[0]?.better ?? 0) + 1;
}
