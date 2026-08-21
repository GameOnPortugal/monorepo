import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import { publicAdsWhere, publicScreenshotsWhere, optedOutDiscordIds } from "../src/repositories/visibility";
import type { PublicAd } from "../src/repositories/ads";
import type { PublicScreenshot } from "../src/repositories/screenshots";
import type { LeaderboardEntry } from "../src/repositories/trophies";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

// GLOBAL-PLAN M9.7: opted-out members' content must be absent from every
// public read path, and a broken opt-out check must fail closed (hide
// everything, never show everything).
const PREFIX = "test-privacy";
const app = buildApp();

const optedOutAuthor = uniqueId(PREFIX);
const visibleAuthor = uniqueId(PREFIX);

let optedOutAdId: string;
let visibleAdId: string;
let optedOutShotId: string;
let visibleShotId: string;
let optedOutProfileId: string;
let visibleProfileId: string;

beforeAll(async () => {
  await prisma.privacySetting.create({
    data: { discordId: optedOutAuthor, publicOptOut: true },
  });

  optedOutAdId = uniqueId(PREFIX);
  visibleAdId = uniqueId(PREFIX);
  await prisma.ad.create({
    data: {
      id: optedOutAdId,
      name: "Should be hidden",
      author_id: optedOutAuthor,
      status: "active",
    },
  });
  await prisma.ad.create({
    data: {
      id: visibleAdId,
      name: "Should stay visible",
      author_id: visibleAuthor,
      status: "active",
    },
  });

  optedOutShotId = uniqueId(PREFIX);
  visibleShotId = uniqueId(PREFIX);
  await prisma.screenshot.create({
    data: { id: optedOutShotId, name: "Hidden shot", author_id: optedOutAuthor },
  });
  await prisma.screenshot.create({
    data: { id: visibleShotId, name: "Visible shot", author_id: visibleAuthor },
  });

  optedOutProfileId = uniqueId(PREFIX);
  visibleProfileId = uniqueId(PREFIX);
  await prisma.trophyProfile.create({
    data: {
      id: optedOutProfileId,
      userId: optedOutAuthor,
      psnProfile: "HiddenHunter",
      isExcluded: false,
    },
  });
  await prisma.trophyProfile.create({
    data: {
      id: visibleProfileId,
      userId: visibleAuthor,
      psnProfile: "VisibleHunter",
      isExcluded: false,
    },
  });
  await prisma.trophies.createMany({
    data: [
      { id: uniqueId(PREFIX), trophyProfile: optedOutProfileId, points: 999 },
      { id: uniqueId(PREFIX), trophyProfile: visibleProfileId, points: 10 },
    ],
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("public read paths honour public_opt_out", () => {
  test("GET /api/marketplace/ads excludes the opted-out author's ad", async () => {
    const res = await app.request("/api/marketplace/ads?limit=200");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ads: PublicAd[] };
    const ids = body.ads.map((a) => a.id);
    expect(ids).toContain(visibleAdId);
    expect(ids).not.toContain(optedOutAdId);
  });

  test("GET /api/marketplace/ads/:id 404s for the opted-out author's ad", async () => {
    const res = await app.request(`/api/marketplace/ads/${optedOutAdId}`);
    expect(res.status).toBe(404);

    const visibleRes = await app.request(`/api/marketplace/ads/${visibleAdId}`);
    expect(visibleRes.status).toBe(200);
  });

  test("GET /api/screenshots excludes the opted-out author's screenshot", async () => {
    const res = await app.request("/api/screenshots?limit=200");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { screenshots: PublicScreenshot[] };
    const ids = body.screenshots.map((s) => s.id);
    expect(ids).toContain(visibleShotId);
    expect(ids).not.toContain(optedOutShotId);
  });

  test("GET /api/trophies/leaderboard excludes the opted-out member's trophy profile", async () => {
    const res = await app.request("/api/trophies/leaderboard?limit=200");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { leaderboard: LeaderboardEntry[] };
    const names = body.leaderboard.map((e) => e.psnProfile);
    expect(names).toContain("VisibleHunter");
    expect(names).not.toContain("HiddenHunter");
  });

  test("opting back in makes the content reappear on every one of the three paths", async () => {
    await prisma.privacySetting.update({
      where: { discordId: optedOutAuthor },
      data: { publicOptOut: false },
    });

    try {
      const adsRes = await app.request("/api/marketplace/ads?limit=200");
      const ads = ((await adsRes.json()) as { ads: PublicAd[] }).ads.map((a) => a.id);
      expect(ads).toContain(optedOutAdId);

      const shotsRes = await app.request("/api/screenshots?limit=200");
      const shots = ((await shotsRes.json()) as { screenshots: PublicScreenshot[] }).screenshots.map(
        (s) => s.id,
      );
      expect(shots).toContain(optedOutShotId);

      const leaderboardRes = await app.request("/api/trophies/leaderboard?limit=200");
      const names = ((await leaderboardRes.json()) as { leaderboard: LeaderboardEntry[] }).leaderboard.map(
        (e) => e.psnProfile,
      );
      expect(names).toContain("HiddenHunter");
    } finally {
      // Restore, so this test does not depend on running before the others
      // above if the runner ever reorders within a file.
      await prisma.privacySetting.update({
        where: { discordId: optedOutAuthor },
        data: { publicOptOut: true },
      });
    }
  });
});

describe("fail-closed: a broken opt-out check must hide, never show, everything", () => {
  const originalFindMany = prisma.privacySetting.findMany;

  afterEach(() => {
    prisma.privacySetting.findMany = originalFindMany;
  });

  test("optedOutDiscordIds() propagates a query failure rather than resolving to an empty (\"nobody opted out\") list", async () => {
    prisma.privacySetting.findMany = (() =>
      Promise.reject(new Error("simulated privacy_settings outage"))) as typeof originalFindMany;

    await expect(optedOutDiscordIds()).rejects.toThrow("simulated privacy_settings outage");
  });

  test("publicAdsWhere()/publicScreenshotsWhere() propagate the same failure instead of silently building an unfiltered query", async () => {
    prisma.privacySetting.findMany = (() =>
      Promise.reject(new Error("simulated privacy_settings outage"))) as typeof originalFindMany;

    await expect(publicAdsWhere()).rejects.toThrow("simulated privacy_settings outage");
    await expect(publicScreenshotsWhere()).rejects.toThrow("simulated privacy_settings outage");
  });

  test("the public ads route surfaces the failure as a 500, not a 200 with unfiltered rows", async () => {
    prisma.privacySetting.findMany = (() =>
      Promise.reject(new Error("simulated privacy_settings outage"))) as typeof originalFindMany;

    const res = await app.request("/api/marketplace/ads?limit=200");
    expect(res.status).toBe(500);
  });
});
