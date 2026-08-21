// M8.11/M8.12 — the admin API surface. Every route in this file is mounted
// behind requireAdmin (see app.ts: `admin.use("*", requireAdmin)` below) —
// there is no public route here, and no route in this file may be reachable
// any other way.
import { Hono } from "hono";
import { countAuditLog, listAuditLog, recordAuditEntry } from "../audit/db";
import { prisma } from "../db";
import {
  countAdminAds,
  forceExpireAd,
  getAdminAdById,
  listAdminAds,
  softDeleteAd,
  updateAdFields,
} from "../repositories/admin/ads";
import { listJobRuns } from "../repositories/admin/jobs";
import {
  countAdminScreenshots,
  deleteScreenshot,
  listAdminScreenshots,
} from "../repositories/admin/screenshots";
import {
  countAdminTrophyProfiles,
  listAdminTrophyProfiles,
  setTrophyProfileFlags,
} from "../repositories/admin/trophyProfiles";
import { getAdmin, requireAdmin } from "../middleware/requireAdmin";
import { parsePagination } from "./pagination";

export const admin = new Hono();
admin.use("*", requireAdmin);

// --- Dashboard -------------------------------------------------------------
// Counts, recent activity, job run status (plan 03's Admin > Dashboard row).

admin.get("/admin/dashboard", async (c) => {
  const [adStatusCounts, screenshotCount, trophyProfileCount, jobs, recentAudit] = await Promise.all([
    prisma.ad.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.screenshot.count(),
    prisma.trophyProfile.count(),
    listJobRuns(),
    listAuditLog({ limit: 10, offset: 0 }),
  ]);

  return c.json({
    ads: Object.fromEntries(adStatusCounts.map((row) => [row.status, row._count._all])),
    screenshots: screenshotCount,
    trophyProfiles: trophyProfileCount,
    jobs,
    recentAudit,
  });
});

// --- Ads ---------------------------------------------------------------

admin.get("/admin/ads", async (c) => {
  const { limit, offset } = parsePagination(c.req.query());
  const status = c.req.query("status");
  const search = c.req.query("search");
  const orphanOnly = c.req.query("orphan") === "true";

  const [ads, total] = await Promise.all([
    listAdminAds({ status, search, orphanOnly, limit, offset }),
    countAdminAds({ status, search, orphanOnly }),
  ]);
  return c.json({ ads, total, limit, offset });
});

admin.get("/admin/ads/:id", async (c) => {
  const ad = await getAdminAdById(c.req.param("id"));
  if (!ad) return c.json({ error: "not found" }, 404);
  return c.json({ ad });
});

admin.patch("/admin/ads/:id", async (c) => {
  const id = c.req.param("id");
  const before = await getAdminAdById(id);
  if (!before) return c.json({ error: "not found" }, 404);

  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const fields = {
    ...(typeof body.description === "string" ? { description: body.description } : {}),
    ...(typeof body.price === "string" ? { price: body.price } : {}),
    ...(typeof body.zone === "string" ? { zone: body.zone } : {}),
  };
  if (Object.keys(fields).length === 0) {
    return c.json({ error: "no editable fields provided (description, price, zone)" }, 400);
  }

  const after = await updateAdFields(id, fields);
  const actor = getAdmin(c);
  recordAuditEntry({
    adminId: actor.id,
    adminUsername: actor.username,
    action: "ad.edit",
    entityType: "ad",
    entityId: id,
    detail: JSON.stringify({ before, fields }),
  });
  return c.json({ ad: after });
});

admin.post("/admin/ads/:id/expire", async (c) => {
  const id = c.req.param("id");
  const after = await forceExpireAd(id);
  if (!after) return c.json({ error: "not found" }, 404);

  const actor = getAdmin(c);
  recordAuditEntry({
    adminId: actor.id,
    adminUsername: actor.username,
    action: "ad.forceExpire",
    entityType: "ad",
    entityId: id,
    detail: null,
  });
  return c.json({ ad: after });
});

admin.delete("/admin/ads/:id", async (c) => {
  const id = c.req.param("id");
  const after = await softDeleteAd(id);
  if (!after) return c.json({ error: "not found" }, 404);

  const actor = getAdmin(c);
  recordAuditEntry({
    adminId: actor.id,
    adminUsername: actor.username,
    action: "ad.delete",
    entityType: "ad",
    entityId: id,
    detail: null,
  });
  return c.json({ ad: after });
});

// --- Screenshots ---------------------------------------------------------

admin.get("/admin/screenshots", async (c) => {
  const { limit, offset } = parsePagination(c.req.query());
  const search = c.req.query("search");

  const [screenshots, total] = await Promise.all([
    listAdminScreenshots({ search, limit, offset }),
    countAdminScreenshots({ search }),
  ]);
  return c.json({ screenshots, total, limit, offset });
});

admin.delete("/admin/screenshots/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteScreenshot(id);
  if (!deleted) return c.json({ error: "not found" }, 404);

  const actor = getAdmin(c);
  recordAuditEntry({
    adminId: actor.id,
    adminUsername: actor.username,
    action: "screenshot.delete",
    entityType: "screenshot",
    entityId: id,
    detail: JSON.stringify({ deleted }),
  });
  return c.json({ ok: true });
});

// --- Trophy profiles -------------------------------------------------------

admin.get("/admin/trophy-profiles", async (c) => {
  const { limit, offset } = parsePagination(c.req.query());
  const search = c.req.query("search");

  const [profiles, total] = await Promise.all([
    listAdminTrophyProfiles({ search, limit, offset }),
    countAdminTrophyProfiles({ search }),
  ]);
  return c.json({ trophyProfiles: profiles, total, limit, offset });
});

admin.patch("/admin/trophy-profiles/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const flags = {
    ...(typeof body.isBanned === "boolean" ? { isBanned: body.isBanned } : {}),
    ...(typeof body.isExcluded === "boolean" ? { isExcluded: body.isExcluded } : {}),
  };
  if (Object.keys(flags).length === 0) {
    return c.json({ error: "no editable flags provided (isBanned, isExcluded)" }, 400);
  }

  const after = await setTrophyProfileFlags(id, flags);
  if (!after) return c.json({ error: "not found" }, 404);

  const actor = getAdmin(c);
  recordAuditEntry({
    adminId: actor.id,
    adminUsername: actor.username,
    action: "trophyProfile.setFlags",
    entityType: "trophyProfile",
    entityId: id,
    detail: JSON.stringify({ flags }),
  });
  return c.json({ trophyProfile: after });
});

// --- Jobs (M8.12, read-only — see repositories/admin/jobs.ts) -------------

admin.get("/admin/jobs", async (c) => {
  const jobs = await listJobRuns();
  return c.json({ jobs });
});

// --- Audit log --------------------------------------------------------

admin.get("/admin/audit-log", async (c) => {
  const { limit, offset } = parsePagination(c.req.query());
  const entityType = c.req.query("entityType");

  const [entries, total] = await Promise.all([
    Promise.resolve(listAuditLog({ entityType, limit, offset })),
    Promise.resolve(countAuditLog({ entityType })),
  ]);
  return c.json({ entries, total, limit, offset });
});
