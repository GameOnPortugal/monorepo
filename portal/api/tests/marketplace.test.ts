import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import type { PublicAd } from "../src/repositories/ads";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

interface AdsListResponse {
  ads: PublicAd[];
  total: number;
}
interface AdResponse {
  ad: PublicAd;
}

const PREFIX = "test-mkt";
const app = buildApp();

let activeId: string;
let deletedId: string;

beforeAll(async () => {
  activeId = uniqueId(PREFIX);
  deletedId = uniqueId(PREFIX);

  await prisma.ad.create({
    data: {
      id: activeId,
      name: "PS5 Digital",
      author_id: "should-never-appear",
      adType: "sell",
      status: "active",
      price: "300",
      price_cents: 30000,
      zone: "Lisboa",
      images: JSON.stringify(["https://media.game-on-portugal.pt/x.webp"]),
    },
  });

  // A soft-deleted row (cross-cutting rule 2) must not appear in public listings.
  await prisma.ad.create({
    data: {
      id: deletedId,
      name: "Deleted item",
      adType: "sell",
      status: "deleted",
    },
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/marketplace/ads", () => {
  test("returns active ads only, and never leaks author_id", async () => {
    const res = await app.request("/api/marketplace/ads?limit=100");
    expect(res.status).toBe(200);

    const body = (await res.json()) as AdsListResponse;
    const ids = body.ads.map((ad) => ad.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(deletedId);

    const found = body.ads.find((ad) => ad.id === activeId);
    expect(found).toBeDefined();
    expect(found?.images).toEqual(["https://media.game-on-portugal.pt/x.webp"]);
    expect(found).not.toHaveProperty("author_id");
    expect(found).not.toHaveProperty("channel_id");
    expect(found).not.toHaveProperty("message_id");
  });

  test("filters by adType", async () => {
    const res = await app.request("/api/marketplace/ads?adType=wanted&limit=100");
    const body = (await res.json()) as AdsListResponse;
    const ids = body.ads.map((ad) => ad.id);
    expect(ids).not.toContain(activeId);
  });
});

describe("GET /api/marketplace/ads/:id", () => {
  test("returns a single active ad", async () => {
    const res = await app.request(`/api/marketplace/ads/${activeId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdResponse;
    expect(body.ad.id).toBe(activeId);
  });

  test("404s for a deleted (not publicly visible) ad", async () => {
    const res = await app.request(`/api/marketplace/ads/${deletedId}`);
    expect(res.status).toBe(404);
  });

  test("404s for an id that does not exist", async () => {
    const res = await app.request("/api/marketplace/ads/does-not-exist");
    expect(res.status).toBe(404);
  });
});
