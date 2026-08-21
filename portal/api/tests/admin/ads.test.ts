import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/db";
import { countAuditLog, listAuditLog } from "../../src/audit/db";
import { adminCookie, cleanupByIdPrefix, uniqueId } from "../helpers";

const PREFIX = "test-admin-ads";
const app = buildApp();
const cookie = adminCookie();

let activeId: string;
let orphanId: string;

beforeAll(async () => {
  activeId = uniqueId(PREFIX);
  orphanId = uniqueId(PREFIX);

  await prisma.ad.create({
    data: {
      id: activeId,
      name: "PS5 Digital",
      author_id: "user-1",
      message_id: "msg-1",
      adType: "sell",
      status: "active",
      price: "300",
      description: "original description",
    },
  });

  // message_id null — the known /marketplace sell write-back bug (#1).
  await prisma.ad.create({
    data: { id: orphanId, name: "Orphaned ad", adType: "sell", status: "active", message_id: null },
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/admin/ads", () => {
  test("requires admin auth", async () => {
    const res = await app.request("/api/admin/ads");
    expect(res.status).toBe(401);
  });

  test("lists ads across all statuses, unlike the public endpoint", async () => {
    const res = await app.request("/api/admin/ads?limit=200", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ads: Array<{ id: string }> };
    const ids = body.ads.map((a) => a.id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(orphanId);
  });

  test("flags orphaned ads (no message_id) and can filter to just them", async () => {
    const res = await app.request(`/api/admin/ads?orphan=true&search=${PREFIX}`, { headers: { cookie } });
    const body = (await res.json()) as { ads: Array<{ id: string; isOrphan: boolean }> };
    expect(body.ads.every((a) => a.isOrphan)).toBe(true);
    expect(body.ads.map((a) => a.id)).toContain(orphanId);
    expect(body.ads.map((a) => a.id)).not.toContain(activeId);
  });
});

describe("PATCH /api/admin/ads/:id", () => {
  test("requires admin auth", async () => {
    const res = await app.request(`/api/admin/ads/${activeId}`, { method: "PATCH" });
    expect(res.status).toBe(401);
  });

  test("edits description/price/zone and records an audit entry", async () => {
    const res = await app.request(`/api/admin/ads/${activeId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ description: "moderated description", zone: "Porto" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ad: { description: string; zone: string } };
    expect(body.ad.description).toBe("moderated description");
    expect(body.ad.zone).toBe("Porto");

    const entries = listAuditLog({ limit: 50, offset: 0 });
    expect(entries.some((e) => e.entityId === activeId && e.action === "ad.edit")).toBe(true);
  });

  test("400s when no editable field is provided", async () => {
    const res = await app.request(`/api/admin/ads/${activeId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "sold" }), // not one of the editable fields
    });
    expect(res.status).toBe(400);
  });

  test("404s for an id that does not exist", async () => {
    const res = await app.request("/api/admin/ads/does-not-exist", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ description: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/ads/:id/expire", () => {
  test("force-expires an ad and audits it", async () => {
    const res = await app.request(`/api/admin/ads/${activeId}/expire`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ad: { status: string; expires_at: string | null } };
    expect(body.ad.status).toBe("expired");
    expect(body.ad.expires_at).not.toBeNull();

    const entries = listAuditLog({ limit: 50, offset: 0 });
    expect(entries.some((e) => e.entityId === activeId && e.action === "ad.forceExpire")).toBe(true);
  });
});

describe("DELETE /api/admin/ads/:id", () => {
  test("soft-deletes (never a hard DELETE) and audits it", async () => {
    const res = await app.request(`/api/admin/ads/${orphanId}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ad: { status: string; deleted_at: string | null } };
    expect(body.ad.status).toBe("deleted");
    expect(body.ad.deleted_at).not.toBeNull();

    // Still physically present — soft delete.
    const row = await prisma.ad.findUnique({ where: { id: orphanId } });
    expect(row).not.toBeNull();

    const entries = listAuditLog({ limit: 50, offset: 0 });
    expect(entries.some((e) => e.entityId === orphanId && e.action === "ad.delete")).toBe(true);
  });
});

describe("audit log attribution", () => {
  test("every write above recorded who made it", async () => {
    const entries = listAuditLog({ entityType: "ad", limit: 100, offset: 0 });
    const forThisTestRun = entries.filter((e) => e.entityId === activeId || e.entityId === orphanId);
    expect(forThisTestRun.length).toBeGreaterThan(0);
    for (const entry of forThisTestRun) {
      expect(entry.adminId).toBe("test-admin-id");
      expect(entry.adminUsername).toBe("test-admin");
      expect(entry.at).toBeTruthy();
    }
    expect(countAuditLog({ entityType: "ad" })).toBeGreaterThanOrEqual(forThisTestRun.length);
  });
});
