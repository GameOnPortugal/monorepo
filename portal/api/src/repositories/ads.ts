import { prisma } from "../db";
import { publicAdsWhere } from "./visibility";

// Marketplace listings. Field mapping and status semantics come from
// discord-bot/prisma/schema.prisma (the `Ad` model) — see docs/plans/00-overview.md
// "Data reality" for how messy `adType`/`state`/`zone`/`price` are as free text.
//
// Deliberately NOT doing platform/condition/zone normalisation here — that is
// GLOBAL-PLAN M8.4 ("shared normalisation module"), a separate work item so
// the bot and the portal can both depend on the same mapping. Raw stored
// values are returned as-is; the web client (or a future M8.4 pass) maps them
// for display.
//
// Never expose `author_id`, `channel_id` or `message_id` in a public
// response — docs/plans/03-portal.md privacy decision 5: "display names
// only, never raw user IDs, in public views." Today there is no display name
// on an Ad at all (no join to a Discord user profile exists), so the public
// shape simply omits authorship. Wiring a display name back in is future
// work, not a gap introduced here.

export interface PublicAd {
  id: string;
  name: string | null;
  adType: string | null;
  status: string;
  state: string | null;
  price: string | null;
  price_cents: number | null;
  zone: string | null;
  dispatch: string | null;
  warranty: string | null;
  description: string | null;
  images: string[];
  bumped_at: Date | null;
  expires_at: Date | null;
  createdAt: Date;
}

// biome-ignore lint/suppress: intentionally loose, see repositories/visibility.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPublicAd(row: any): PublicAd {
  let images: string[] = [];
  if (row.images) {
    try {
      const parsed = JSON.parse(row.images);
      if (Array.isArray(parsed)) images = parsed;
    } catch {
      // Malformed/legacy `images` text — degrade to no images rather than 500.
      images = [];
    }
  }

  return {
    id: row.id,
    name: row.name,
    adType: row.adType,
    status: row.status,
    state: row.state,
    price: row.price,
    price_cents: row.price_cents,
    zone: row.zone,
    dispatch: row.dispatch,
    warranty: row.warranty,
    description: row.description,
    images,
    bumped_at: row.bumped_at,
    expires_at: row.expires_at,
    createdAt: row.createdAt,
  };
}

export interface ListAdsFilters {
  adType?: string;
  status?: string;
  limit: number;
  offset: number;
}

export async function listAds(filters: ListAdsFilters): Promise<PublicAd[]> {
  const where = await publicAdsWhere({
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.adType ? { adType: filters.adType } : {}),
  });

  const rows = await prisma.ad.findMany({
    where,
    orderBy: [{ bumped_at: "desc" }, { createdAt: "desc" }],
    take: filters.limit,
    skip: filters.offset,
  });

  return rows.map(toPublicAd);
}

export async function countAds(filters: Pick<ListAdsFilters, "adType" | "status">): Promise<number> {
  const where = await publicAdsWhere({
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.adType ? { adType: filters.adType } : {}),
  });
  return prisma.ad.count({ where });
}

export async function getAdById(id: string): Promise<PublicAd | null> {
  const row = await prisma.ad.findFirst({ where: await publicAdsWhere({ id }) });
  return row ? toPublicAd(row) : null;
}
