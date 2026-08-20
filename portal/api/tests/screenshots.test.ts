import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import type { PublicScreenshot } from "../src/repositories/screenshots";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

interface ScreenshotsListResponse {
  screenshots: PublicScreenshot[];
  total: number;
}

const PREFIX = "test-shot";
const app = buildApp();

let ps5Id: string;
let xboxId: string;

beforeAll(async () => {
  ps5Id = uniqueId(PREFIX);
  xboxId = uniqueId(PREFIX);

  await prisma.screenshot.create({
    data: {
      id: ps5Id,
      name: "Platinum!",
      author_id: "should-never-appear",
      plataform: "PS5",
      image: "https://media.game-on-portugal.pt/a.webp",
    },
  });

  await prisma.screenshot.create({
    data: {
      id: xboxId,
      name: "Achievement unlocked",
      plataform: "XBOX SERIE X - 60FPS",
      image: "https://media.game-on-portugal.pt/b.webp",
    },
  });
});

afterAll(async () => {
  await cleanupByIdPrefix(PREFIX);
});

describe("GET /api/screenshots", () => {
  test("lists screenshots newest first, without author_id", async () => {
    const res = await app.request("/api/screenshots?limit=100");
    expect(res.status).toBe(200);

    const body = (await res.json()) as ScreenshotsListResponse;
    const ids = body.screenshots.map((s) => s.id);
    expect(ids).toContain(ps5Id);
    expect(ids).toContain(xboxId);

    const found = body.screenshots.find((s) => s.id === ps5Id);
    expect(found?.platform).toBe("PS5");
    expect(found?.imageUrl).toBe("https://media.game-on-portugal.pt/a.webp");
    expect(found).not.toHaveProperty("author_id");
  });

  test("filters by the raw stored platform string", async () => {
    const res = await app.request("/api/screenshots?platform=PS5&limit=100");
    const body = (await res.json()) as ScreenshotsListResponse;
    const ids = body.screenshots.map((s) => s.id);
    expect(ids).toContain(ps5Id);
    expect(ids).not.toContain(xboxId);
  });
});
