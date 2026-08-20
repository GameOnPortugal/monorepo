import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import type { LeaderboardEntry } from "../src/repositories/trophies";
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
      { id: uniqueId(PREFIX), trophyProfile: topProfileId, points: 90 },
      { id: uniqueId(PREFIX), trophyProfile: topProfileId, points: 30 },
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
