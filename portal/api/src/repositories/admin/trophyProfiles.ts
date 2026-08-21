// M8.11 — admin reads/writes over `trophyprofiles`. `isBanned`/`isExcluded`
// already exist on the schema (TrophiesSyncJob, M7, is the other writer of
// these two columns — see repositories/visibility.ts's header) — this module
// is the admin's manual override of the same two flags, e.g. to exclude a
// profile the sync job has not (yet) flagged, or to un-exclude a false
// positive. `hasLeft` is deliberately not exposed for admin editing: it is
// sync-job-derived membership state, not a moderation decision.
import { prisma } from "../../db";

export interface AdminTrophyProfile {
  id: string;
  userId: string | null;
  psnProfile: string | null;
  isBanned: boolean;
  hasLeft: boolean;
  isExcluded: boolean;
  createdAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAdminTrophyProfile(row: any): AdminTrophyProfile {
  return {
    id: row.id,
    userId: row.userId,
    psnProfile: row.psnProfile,
    isBanned: Boolean(row.isBanned),
    hasLeft: Boolean(row.hasLeft),
    isExcluded: Boolean(row.isExcluded),
    createdAt: row.createdAt,
  };
}

export interface ListAdminTrophyProfilesFilters {
  search?: string;
  limit: number;
  offset: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWhere(filters: Pick<ListAdminTrophyProfilesFilters, "search">): any {
  return filters.search
    ? { OR: [{ psnProfile: { contains: filters.search } }, { id: { contains: filters.search } }] }
    : {};
}

export async function listAdminTrophyProfiles(
  filters: ListAdminTrophyProfilesFilters,
): Promise<AdminTrophyProfile[]> {
  const rows = await prisma.trophyProfile.findMany({
    where: buildWhere(filters),
    orderBy: { createdAt: "desc" },
    take: filters.limit,
    skip: filters.offset,
  });
  return rows.map(toAdminTrophyProfile);
}

export async function countAdminTrophyProfiles(
  filters: Pick<ListAdminTrophyProfilesFilters, "search">,
): Promise<number> {
  return prisma.trophyProfile.count({ where: buildWhere(filters) });
}

export interface TrophyProfileFlags {
  isBanned?: boolean;
  isExcluded?: boolean;
}

export async function setTrophyProfileFlags(
  id: string,
  flags: TrophyProfileFlags,
): Promise<AdminTrophyProfile | null> {
  const exists = await prisma.trophyProfile.findUnique({ where: { id } });
  if (!exists) return null;
  const row = await prisma.trophyProfile.update({
    where: { id },
    data: {
      ...(flags.isBanned !== undefined ? { isBanned: flags.isBanned } : {}),
      ...(flags.isExcluded !== undefined ? { isExcluded: flags.isExcluded } : {}),
    },
  });
  return toAdminTrophyProfile(row);
}
