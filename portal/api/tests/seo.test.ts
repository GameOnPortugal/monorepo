import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

const PREFIX = "test-sitemap";
const app = buildApp();

let activeId: string;
let deletedId: string;

beforeAll(async () => {
  activeId = uniqueId(PREFIX);
  deletedId = uniqueId(PREFIX);
  await prisma.ad.create({ data: { id: activeId, name: "Sitemap ad", adType: "sell", status: "active" } });
  await prisma.ad.create({ data: { id: deletedId, name: "Deleted ad", adType: "sell", status: "deleted" } });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /sitemap.xml", () => {
  test("lists static public routes and active ad detail pages, excludes admin and non-public ads", async () => {
    const res = await app.request("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");

    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("/marketplace</loc>");
    expect(body).toContain(`/marketplace/${activeId}</loc>`);
    expect(body).not.toContain(`/marketplace/${deletedId}</loc>`);
    expect(body).not.toContain("/admin");
  });
});
