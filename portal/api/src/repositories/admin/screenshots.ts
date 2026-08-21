// M8.11 — admin reads/writes over `screenshots`. See admin/ads.ts's header
// for why this is a separate module from the public repositories/screenshots.ts
// (that one is permanently filtered to the public shape; this one is not,
// and is only reachable behind requireAdmin — see routes/admin.ts).
//
// There is no soft-delete column on `screenshots` (unlike `ads`, which has
// `deleted_at`/status `deleted`) — schema.prisma's Screenshot model is a
// straight port of the legacy Sequelize table with no lifecycle columns at
// all. Adding one would be a discord-bot/prisma migration, which this agent
// cannot make (see portal/README.md). So "delete" here is a real
// `DELETE FROM screenshots`, same as the row disappearing from Discord if a
// moderator deleted the original message — recorded in the audit log
// precisely because it is irreversible.
import { prisma } from "../../db";

export interface AdminScreenshot {
  id: string;
  name: string | null;
  authorId: string | null;
  platform: string | null;
  imageUrl: string | null;
  createdAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAdminScreenshot(row: any): AdminScreenshot {
  return {
    id: row.id,
    name: row.name,
    authorId: row.author_id,
    platform: row.plataform,
    imageUrl: row.image,
    createdAt: row.createdAt,
  };
}

export interface ListAdminScreenshotsFilters {
  search?: string;
  limit: number;
  offset: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWhere(filters: Pick<ListAdminScreenshotsFilters, "search">): any {
  return filters.search
    ? { OR: [{ name: { contains: filters.search } }, { id: { contains: filters.search } }] }
    : {};
}

export async function listAdminScreenshots(filters: ListAdminScreenshotsFilters): Promise<AdminScreenshot[]> {
  const rows = await prisma.screenshot.findMany({
    where: buildWhere(filters),
    orderBy: { createdAt: "desc" },
    take: filters.limit,
    skip: filters.offset,
  });
  return rows.map(toAdminScreenshot);
}

export async function countAdminScreenshots(filters: Pick<ListAdminScreenshotsFilters, "search">): Promise<number> {
  return prisma.screenshot.count({ where: buildWhere(filters) });
}

export async function getAdminScreenshotById(id: string): Promise<AdminScreenshot | null> {
  const row = await prisma.screenshot.findUnique({ where: { id } });
  return row ? toAdminScreenshot(row) : null;
}

export async function deleteScreenshot(id: string): Promise<AdminScreenshot | null> {
  const existing = await prisma.screenshot.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.screenshot.delete({ where: { id } });
  return toAdminScreenshot(existing);
}
