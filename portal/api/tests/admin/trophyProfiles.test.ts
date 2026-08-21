import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/db";
import { listAuditLog } from "../../src/audit/db";
import { adminCookie, cleanupByIdPrefix, uniqueId } from "../helpers";

const PREFIX = "test-admin-tp";
const app = buildApp();
const cookie = adminCookie();

let id: string;

beforeAll(async () => {
  id = uniqueId(PREFIX);
  await prisma.trophyProfile.create({
    data: { id, userId: "user-1", psnProfile: "some-gamer", isBanned: false, isExcluded: false },
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/admin/trophy-profiles", () => {
  test("requires admin auth", async () => {
    const res = await app.request("/api/admin/trophy-profiles");
    expect(res.status).toBe(401);
  });

  test("lists profiles including userId, unlike any public endpoint", async () => {
    const res = await app.request(`/api/admin/trophy-profiles?search=${PREFIX}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { trophyProfiles: Array<{ id: string; userId: string | null }> };
    expect(body.trophyProfiles.find((p) => p.id === id)?.userId).toBe("user-1");
  });
});

describe("PATCH /api/admin/trophy-profiles/:id", () => {
  test("requires admin auth", async () => {
    const res = await app.request(`/api/admin/trophy-profiles/${id}`, { method: "PATCH" });
    expect(res.status).toBe(401);
  });

  test("sets isBanned/isExcluded and audits it", async () => {
    const res = await app.request(`/api/admin/trophy-profiles/${id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ isBanned: true, isExcluded: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { trophyProfile: { isBanned: boolean; isExcluded: boolean } };
    expect(body.trophyProfile.isBanned).toBe(true);
    expect(body.trophyProfile.isExcluded).toBe(true);

    const row = await prisma.trophyProfile.findUnique({ where: { id } });
    expect(row?.isBanned).toBe(true);

    const entries = listAuditLog({ entityType: "trophyProfile", limit: 50, offset: 0 });
    expect(entries.some((e) => e.entityId === id && e.action === "trophyProfile.setFlags")).toBe(true);
  });

  test("400s with no recognised flag", async () => {
    const res = await app.request(`/api/admin/trophy-profiles/${id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ psnProfile: "renamed" }),
    });
    expect(res.status).toBe(400);
  });

  test("404s for an id that does not exist", async () => {
    const res = await app.request("/api/admin/trophy-profiles/does-not-exist", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ isBanned: true }),
    });
    expect(res.status).toBe(404);
  });
});
