import { describe, expect, test } from "bun:test";
import { buildApp } from "../../src/app";
import { countAuditLog, listAuditLog, recordAuditEntry } from "../../src/audit/db";
import { adminCookie, uniqueId } from "../helpers";

const app = buildApp();
const cookie = adminCookie();

describe("audit/db.ts", () => {
  test("records and lists an entry", () => {
    const entityId = uniqueId("test-audit-entity");
    const before = countAuditLog({ entityType: "unit-test" });
    recordAuditEntry({
      adminId: "1",
      adminUsername: "someone",
      action: "unit.test",
      entityType: "unit-test",
      entityId,
      detail: JSON.stringify({ hello: "world" }),
    });
    const after = countAuditLog({ entityType: "unit-test" });
    expect(after).toBe(before + 1);

    const entries = listAuditLog({ entityType: "unit-test", limit: 10, offset: 0 });
    const found = entries.find((e) => e.entityId === entityId);
    expect(found).toBeDefined();
    expect(found?.action).toBe("unit.test");
    expect(found?.detail).toBe(JSON.stringify({ hello: "world" }));
    expect(found?.at).toBeTruthy();
  });

  test("newest entries come first", () => {
    const a = uniqueId("test-audit-order-a");
    const b = uniqueId("test-audit-order-b");
    recordAuditEntry({
      adminId: "1",
      adminUsername: "someone",
      action: "unit.test.order",
      entityType: "unit-test-order",
      entityId: a,
      detail: null,
    });
    recordAuditEntry({
      adminId: "1",
      adminUsername: "someone",
      action: "unit.test.order",
      entityType: "unit-test-order",
      entityId: b,
      detail: null,
    });
    const entries = listAuditLog({ entityType: "unit-test-order", limit: 10, offset: 0 });
    expect(entries[0]?.entityId).toBe(b);
    expect(entries[1]?.entityId).toBe(a);
  });
});

describe("GET /api/admin/audit-log", () => {
  test("requires admin auth", async () => {
    const res = await app.request("/api/admin/audit-log");
    expect(res.status).toBe(401);
  });

  test("returns entries recorded by admin writes", async () => {
    const entityId = uniqueId("test-audit-route");
    recordAuditEntry({
      adminId: "1",
      adminUsername: "someone",
      action: "unit.test.route",
      entityType: "unit-test-route",
      entityId,
      detail: null,
    });

    const res = await app.request("/api/admin/audit-log?entityType=unit-test-route&limit=10", {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ entityId: string }>; total: number };
    expect(body.entries.some((e) => e.entityId === entityId)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });
});
