import { prisma } from "../db";
import { publicTrophyProfileFilter } from "./visibility";

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
