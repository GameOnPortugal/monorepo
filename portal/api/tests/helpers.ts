import { prisma } from "../src/db";
import { encodeSession } from "../src/lib/session";
import { SESSION_COOKIE } from "../src/middleware/requireAdmin";

// Test-only fixture helpers. Writing rows here is the test *setup*, not the
// API under test.
//
// Until M8.11, the API itself never called a Prisma write method at all —
// that changed with src/repositories/admin/*.ts, which write (deliberately:
// force-expire/delete an ad, delete a screenshot, ban/exclude a trophy
// profile). The boundary that still holds: only code reachable behind
// requireAdmin (src/middleware/requireAdmin.ts) writes, everything under
// src/repositories/*.ts (not repositories/admin/) stays read-only, and every
// admin write is paired with an audit_log row (src/audit/db.ts). See
// portal/README.md "Schema ownership" for the fuller version of this rule.

export function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function cleanupByIdPrefix(prefix: string): Promise<void> {
  await prisma.ad.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.screenshot.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.trophies.deleteMany({ where: { trophyProfile: { startsWith: prefix } } });
  await prisma.trophyProfile.deleteMany({ where: { id: { startsWith: prefix } } });
  // M9.7 — tests that seed an opted-out author key `PrivacySetting.discordId`
  // with the same prefix as everything else, so one cleanup call catches it.
  await prisma.privacySetting.deleteMany({ where: { discordId: { startsWith: prefix } } });
}

/**
 * A `Cookie` header value carrying a validly signed, unexpired admin
 * session — for driving `/api/admin/*` routes in tests without a real
 * Discord OAuth round trip (see tests/adminAuth.test.ts for the route itself
 * being exercised end-to-end). Requires `SESSION_SECRET` to be set
 * (tests/preload.ts sets a fixed test value for the whole suite).
 */
export function adminCookie(overrides: Partial<{ sub: string; username: string }> = {}): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set for adminCookie() — check tests/preload.ts");

  const token = encodeSession(
    {
      sub: overrides.sub ?? "test-admin-id",
      username: overrides.username ?? "test-admin",
      avatar: null,
      exp: Date.now() + 60_000,
    },
    secret,
  );
  return `${SESSION_COOKIE}=${token}`;
}
