import { prisma } from "../src/db";

// Test-only fixture helpers. Writing rows here is the test *setup*, not the
// API under test — the API itself (src/) never calls a Prisma write method.
// See db.ts's header comment for why that boundary matters.

export function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function cleanupByIdPrefix(prefix: string): Promise<void> {
  await prisma.ad.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.screenshot.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.trophies.deleteMany({ where: { trophyProfile: { startsWith: prefix } } });
  await prisma.trophyProfile.deleteMany({ where: { id: { startsWith: prefix } } });
}
