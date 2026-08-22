import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import type { Hunter, LeaderboardEntry } from "../src/repositories/trophies";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  limit: number;
}

const PREFIX = "test-trophy";
const app = buildApp();

let topProfileId: string;
let bannedProfileId: string;
let noTrophiesProfileId: string;

beforeAll(async () => {
  topProfileId = uniqueId(PREFIX);
  bannedProfileId = uniqueId(PREFIX);
  noTrophiesProfileId = uniqueId(PREFIX);

  await prisma.trophyProfile.create({
    data: { id: topProfileId, userId: "u1", psnProfile: "TopHunter", isExcluded: false },
  });
  await prisma.trophyProfile.create({
    data: { id: bannedProfileId, userId: "u2", psnProfile: "BannedPlayer", isExcluded: true, isBanned: true },
  });
  await prisma.trophyProfile.create({
    data: { id: noTrophiesProfileId, userId: "u3", psnProfile: "NoTrophiesYet", isExcluded: false },
  });

  await prisma.trophies.createMany({
    data: [
      {
        id: uniqueId(PREFIX),
        trophyProfile: topProfileId,
        points: 90,
        url: "https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/TopHunter",
        completionDate: new Date("2024-03-02T00:00:00Z"),
      },
      {
        id: uniqueId(PREFIX),
        trophyProfile: topProfileId,
        points: 30,
        url: "https://psnprofiles.com/trophies/12-grand-theft-auto-iv/TopHunter",
        completionDate: new Date("2023-01-05T00:00:00Z"),
      },
      // Excluded profile has trophies, but must never appear in the leaderboard.
      { id: uniqueId(PREFIX), trophyProfile: bannedProfileId, points: 500 },
    ],
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/trophies/leaderboard", () => {
  test("ranks by summed points, excludes isExcluded profiles, and never leaks userId", async () => {
    const res = await app.request("/api/trophies/leaderboard?limit=50");
    expect(res.status).toBe(200);

    const body = (await res.json()) as LeaderboardResponse;
    const names = body.leaderboard.map((e) => e.psnProfile);

    expect(names).toContain("TopHunter");
    expect(names).not.toContain("BannedPlayer");
    // A profile with zero trophies is not a zero-point row — it's absent (INNER JOIN).
    expect(names).not.toContain("NoTrophiesYet");

    const top = body.leaderboard.find((e) => e.psnProfile === "TopHunter");
    expect(top?.points).toBe(120);
    expect(top?.trophyCount).toBe(2);
    expect(top).not.toHaveProperty("userId");
  });
});

describe("GET /api/trophies/hunters/:psnProfile", () => {
  test("returns the hunter's own platinum list, newest first, without leaking userId", async () => {
    const res = await app.request("/api/trophies/hunters/TopHunter");
    expect(res.status).toBe(200);

    const { hunter } = (await res.json()) as { hunter: Hunter };

    expect(hunter.psnProfile).toBe("TopHunter");
    expect(hunter.points).toBe(120);
    expect(hunter.trophyCount).toBe(2);
    expect(hunter.rank).toBeGreaterThanOrEqual(1);
    expect(hunter).not.toHaveProperty("userId");

    // Ordered by completionDate DESC — the 2024 platinum comes before the 2023 one.
    expect(hunter.trophies.map((t) => t.points)).toEqual([90, 30]);
    // The URL is what makes the game recoverable client-side (src/lib/psn.ts).
    expect(hunter.trophies[0]?.url).toContain("11783-assassins-creed-valhalla");
  });

  test("404s for an excluded profile, so it cannot be used to route around the leaderboard filter", async () => {
    const res = await app.request("/api/trophies/hunters/BannedPlayer");
    expect(res.status).toBe(404);
  });

  test("404s for a profile with no trophies, matching the leaderboard's INNER JOIN semantics", async () => {
    const res = await app.request("/api/trophies/hunters/NoTrophiesYet");
    expect(res.status).toBe(404);
  });

  test("404s for an unknown profile", async () => {
    const res = await app.request("/api/trophies/hunters/does-not-exist-at-all");
    expect(res.status).toBe(404);
  });
});
