import { prisma } from "../db";
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
// Never expose `author_id`/`channel_id`/`message_id` — same privacy rule as
// ads.ts.

export interface PublicScreenshot {
  id: string;
  name: string | null;
  platform: string | null;
  imageUrl: string | null;
  createdAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPublicScreenshot(row: any): PublicScreenshot {
  return {
    id: row.id,
    name: row.name,
    platform: row.plataform,
    imageUrl: row.image,
    createdAt: row.createdAt,
  };
}

export interface ListScreenshotsFilters {
  platform?: string;
  limit: number;
  offset: number;
}

export async function listScreenshots(filters: ListScreenshotsFilters): Promise<PublicScreenshot[]> {
  const where = publicScreenshotsWhere(filters.platform ? { plataform: filters.platform } : {});

  const rows = await prisma.screenshot.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit,
    skip: filters.offset,
  });

  return rows.map(toPublicScreenshot);
}

export async function countScreenshots(filters: Pick<ListScreenshotsFilters, "platform">): Promise<number> {
  const where = publicScreenshotsWhere(filters.platform ? { plataform: filters.platform } : {});
  return prisma.screenshot.count({ where });
}
