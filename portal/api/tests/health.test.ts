import { describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  test("reports ok when the database is reachable", async () => {
    const app = buildApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("portal-api");
  });
});
