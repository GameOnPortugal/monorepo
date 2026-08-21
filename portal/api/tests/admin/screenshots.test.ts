import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/db";
import { listAuditLog } from "../../src/audit/db";
import { adminCookie, cleanupByIdPrefix, uniqueId } from "../helpers";

const PREFIX = "test-admin-shots";
const app = buildApp();
const cookie = adminCookie();

let id: string;

beforeAll(async () => {
  id = uniqueId(PREFIX);
  await prisma.screenshot.create({
    data: { id, name: "shot", author_id: "user-1", plataform: "PS5", image: "https://example.com/x.png" },
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/admin/screenshots", () => {
  test("requires admin auth", async () => {
    const res = await app.request("/api/admin/screenshots");
    expect(res.status).toBe(401);
  });

  test("includes author_id, unlike the public endpoint", async () => {
    const res = await app.request(`/api/admin/screenshots?search=${PREFIX}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { screenshots: Array<{ id: string; authorId: string | null }> };
    const found = body.screenshots.find((s) => s.id === id);
    expect(found?.authorId).toBe("user-1");
  });
});

describe("DELETE /api/admin/screenshots/:id", () => {
  test("requires admin auth", async () => {
    const res = await app.request(`/api/admin/screenshots/${id}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  test("hard-deletes (no soft-delete column exists) and audits it", async () => {
    const res = await app.request(`/api/admin/screenshots/${id}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);

    const row = await prisma.screenshot.findUnique({ where: { id } });
    expect(row).toBeNull();

    const entries = listAuditLog({ entityType: "screenshot", limit: 50, offset: 0 });
    expect(entries.some((e) => e.entityId === id && e.action === "screenshot.delete")).toBe(true);
  });

  test("404s for an id that no longer exists", async () => {
    const res = await app.request(`/api/admin/screenshots/${id}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(404);
  });
});
