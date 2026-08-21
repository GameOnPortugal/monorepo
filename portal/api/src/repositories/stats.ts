import { prisma } from "../db";
import { publicAdsWhere, publicScreenshotsWhere, publicTrophyProfileFilter } from "./visibility";

// M8.6 Home page "live stats". There is deliberately no Discord guild member
// count here: the portal API only has a database connection (see
// portal/README.md "Schema ownership") — it holds no Discord bot token and
// makes no Discord API calls, so a live member count is not obtainable from
// this service. `hunters` (distinct trophy profiles with at least one
// trophy, same INNER JOIN semantics as the leaderboard) is used instead as
// the "people" stat the data can actually support. Recorded as a decision in
// the M8.6 row of docs/plans/GLOBAL-PLAN.md rather than silently faking a
// number.
export interface PortalStats {
  activeAds: number;
  screenshots: number;
  trophies: number;
  hunters: number;
}

export async function getStats(): Promise<PortalStats> {
  const [adsWhere, screenshotsWhere] = await Promise.all([publicAdsWhere(), publicScreenshotsWhere()]);

  const [activeAds, screenshots, trophies, huntersRows] = await Promise.all([
    prisma.ad.count({ where: adsWhere }),
    prisma.screenshot.count({ where: screenshotsWhere }),
    prisma.trophies.count(),
    prisma.$queryRawUnsafe<{ hunters: bigint | number }[]>(
      `
        SELECT CAST(COUNT(DISTINCT tp.id) AS SIGNED) AS hunters
        FROM trophyprofiles tp
        INNER JOIN trophies t ON t.trophyProfile = tp.id
        WHERE ${publicTrophyProfileFilter()}
      `,
    ),
  ]);

  return {
    activeAds,
    screenshots,
    trophies,
    hunters: Number(huntersRows[0]?.hunters ?? 0),
  };
}
