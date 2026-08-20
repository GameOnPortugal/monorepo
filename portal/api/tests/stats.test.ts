import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

interface StatsResponse {
  activeAds: number;
  screenshots: number;
  trophies: number;
  hunters: number;
}

const PREFIX = "test-stats";
const app = buildApp();

let profileId: string;

beforeAll(async () => {
  const adId = uniqueId(PREFIX);
  const shotId = uniqueId(PREFIX);
  profileId = uniqueId(PREFIX);

  await prisma.ad.create({ data: { id: adId, name: "Stats ad", adType: "sell", status: "active" } });
  await prisma.screenshot.create({ data: { id: shotId, name: "Stats shot" } });
  await prisma.trophyProfile.create({ data: { id: profileId, psnProfile: "StatsHunter", isExcluded: false } });
  await prisma.trophies.create({ data: { id: uniqueId(PREFIX), trophyProfile: profileId, points: 10 } });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/stats", () => {
  test("returns non-negative counts including the fixture rows", async () => {
    const res = await app.request("/api/stats");
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatsResponse;
    expect(body.activeAds).toBeGreaterThanOrEqual(1);
    expect(body.screenshots).toBeGreaterThanOrEqual(1);
    expect(body.trophies).toBeGreaterThanOrEqual(1);
    expect(body.hunters).toBeGreaterThanOrEqual(1);
  });
});
