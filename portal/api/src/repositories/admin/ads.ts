// M8.11 — admin reads/writes over `ads`.
//
// Unlike repositories/ads.ts (public, always filtered to `status: active`
// via visibility.ts), these functions are only ever reachable behind
// requireAdmin (see routes/admin.ts) and deliberately see every status,
// including `deleted` — an admin needs to find orphans and dead listings,
// not just the public set. Every write here goes through admin/auditedWrite.ts
// so nothing mutates `ads` without an audit_log row (M8.11's "every
// destructive action recorded: who, what, when").
//
// Status values match discord-bot/src/Domain/Marketplace/AdStatus.ts's
// VALUES exactly ('active' | 'pending_renewal' | 'sold' | 'expired' |
// 'deleted') — this file does not import that class (the portal never
// imports bot Domain/Application code, see repositories/trophies.ts's header
// for the same rule), it just agrees with it by construction.
import { prisma } from "../../db";

export interface AdminAd {
  id: string;
  name: string | null;
  authorId: string | null;
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
  sold_at: Date | null;
  deleted_at: Date | null;
  createdAt: Date;
  /** message_id is null — docs/known-issues.md #1, the /marketplace sell write-back bug. */
  isOrphan: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAdminAd(row: any): AdminAd {
  let images: string[] = [];
  if (row.images) {
    try {
      const parsed = JSON.parse(row.images);
      if (Array.isArray(parsed)) images = parsed;
    } catch {
      images = [];
    }
  }
  return {
    id: row.id,
    name: row.name,
    authorId: row.author_id,
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
    sold_at: row.sold_at,
    deleted_at: row.deleted_at,
    createdAt: row.createdAt,
    isOrphan: !row.message_id,
  };
}

export interface ListAdminAdsFilters {
  status?: string;
  search?: string;
  orphanOnly?: boolean;
  limit: number;
  offset: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWhere(filters: Pick<ListAdminAdsFilters, "status" | "search" | "orphanOnly">): any {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.orphanOnly ? { message_id: null } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search } },
            { description: { contains: filters.search } },
            { id: { contains: filters.search } },
          ],
        }
      : {}),
  };
}

export async function listAdminAds(filters: ListAdminAdsFilters): Promise<AdminAd[]> {
  const rows = await prisma.ad.findMany({
    where: buildWhere(filters),
    orderBy: [{ createdAt: "desc" }],
    take: filters.limit,
    skip: filters.offset,
  });
  return rows.map(toAdminAd);
}

export async function countAdminAds(filters: Pick<ListAdminAdsFilters, "status" | "search" | "orphanOnly">): Promise<number> {
  return prisma.ad.count({ where: buildWhere(filters) });
}

export async function getAdminAdById(id: string): Promise<AdminAd | null> {
  const row = await prisma.ad.findUnique({ where: { id } });
  return row ? toAdminAd(row) : null;
}

export interface EditableAdFields {
  description?: string;
  price?: string;
  zone?: string;
}

/** `/marketplace edit`'s field set (M5.6) — description/price/zone are the free-text fields worth an admin correcting; adType/status changes go through the dedicated expire/delete actions below, never this generic patch. */
export async function updateAdFields(id: string, fields: EditableAdFields): Promise<AdminAd | null> {
  const exists = await prisma.ad.findUnique({ where: { id } });
  if (!exists) return null;

  const row = await prisma.ad.update({
    where: { id },
    data: {
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.price !== undefined ? { price: fields.price } : {}),
      ...(fields.zone !== undefined ? { zone: fields.zone } : {}),
    },
  });
  return toAdminAd(row);
}

export async function forceExpireAd(id: string): Promise<AdminAd | null> {
  const exists = await prisma.ad.findUnique({ where: { id } });
  if (!exists) return null;
  const row = await prisma.ad.update({
    where: { id },
    data: { status: "expired", expires_at: new Date() },
  });
  return toAdminAd(row);
}

/** Soft delete — matches the lifecycle's existing `deleted` status (M5.3/M6), never a hard `DELETE FROM`. */
export async function softDeleteAd(id: string): Promise<AdminAd | null> {
  const exists = await prisma.ad.findUnique({ where: { id } });
  if (!exists) return null;
  const row = await prisma.ad.update({
    where: { id },
    data: { status: "deleted", deleted_at: new Date() },
  });
  return toAdminAd(row);
}
