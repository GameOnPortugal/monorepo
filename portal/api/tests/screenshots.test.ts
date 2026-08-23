import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { prisma } from "../src/db";
import type { PublicScreenshot } from "../src/repositories/screenshots";
import type { PublicWinner } from "../src/repositories/winners";
import { cleanupByIdPrefix, uniqueId } from "./helpers";

interface ScreenshotsListResponse {
  screenshots: PublicScreenshot[];
  total: number;
}

interface WinnersResponse {
  winners: PublicWinner[];
  total: number;
}

const PREFIX = "test-shot";
const app = buildApp();

let ps5Id: string;
let xboxId: string;
let creditedId: string;
let creditedAuthorId: string;

beforeAll(async () => {
  ps5Id = uniqueId(PREFIX);
  xboxId = uniqueId(PREFIX);
  creditedId = uniqueId(PREFIX);
  creditedAuthorId = uniqueId(PREFIX);

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

  // M10.5/M10.7 — a screenshot with a cached author profile and a winner row,
  // i.e. the fully-credited shape the gallery and Hall of Fame render.
  await prisma.discordProfile.create({
    data: {
      discordId: creditedAuthorId,
      username: "handle-only",
      displayName: "Nome Visível",
      avatarUrl: "https://media.game-on-portugal.pt/gop-media/avatars/abc123.png",
      avatarHash: "abc123",
      syncedAt: new Date(),
    },
  });

  await prisma.screenshot.create({
    data: {
      id: creditedId,
      name: "A vencedora",
      author_id: creditedAuthorId,
      channel_id: "827646847483904040",
      message_id: "1234567890",
      plataform: "PS5",
      image: "https://media.game-on-portugal.pt/c.webp",
    },
  });

  await prisma.screenshotWinner.create({
    data: {
      id: uniqueId(PREFIX),
      screenshotId: creditedId,
      authorId: creditedAuthorId,
      weekStart: new Date("2026-01-05T00:00:00.000Z"),
      weekEnd: new Date("2026-01-11T23:59:59.999Z"),
      voteCount: 7,
      messageUrl: "https://discord.com/channels/1/2/3",
      source: "announced",
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

  // M10.5 — the credit, and the line it must not cross.
  test("credits the author by display name and re-hosted avatar", async () => {
    const res = await app.request("/api/screenshots?limit=1000");
    const body = (await res.json()) as ScreenshotsListResponse;
    const found = body.screenshots.find((s) => s.id === creditedId);

    // displayName wins over username — same precedence Discord itself uses.
    expect(found?.author?.name).toBe("Nome Visível");
    expect(found?.author?.avatarUrl).toBe("https://media.game-on-portugal.pt/gop-media/avatars/abc123.png");
    // Never a Discord CDN link: the bot re-hosts avatars precisely so a
    // public URL never carries a member's snowflake (see repositories/credit.ts).
    expect(found?.author?.avatarUrl).not.toContain("discordapp.com");
  });

  test("returns a derived messageUrl but never the raw ids it is built from", async () => {
    const res = await app.request("/api/screenshots?limit=1000");
    const body = (await res.json()) as ScreenshotsListResponse;
    const found = body.screenshots.find((s) => s.id === creditedId);

    expect(found?.messageUrl).toBe(
      "https://discord.com/channels/818108848492773377/827646847483904040/1234567890",
    );
    expect(found).not.toHaveProperty("author_id");
    expect(found).not.toHaveProperty("channel_id");
    expect(found).not.toHaveProperty("message_id");
    expect(JSON.stringify(found)).not.toContain(creditedAuthorId);
  });

  test("a screenshot whose author has no cached profile is still listed, just uncredited", async () => {
    // Hiding it would make the gallery's own total lie — the same rule this
    // repository already applies to a missing image.
    const res = await app.request("/api/screenshots?limit=1000");
    const body = (await res.json()) as ScreenshotsListResponse;
    const found = body.screenshots.find((s) => s.id === ps5Id);

    expect(found).toBeDefined();
    expect(found?.author).toBeNull();
  });

  test("flags the screenshot that won its week", async () => {
    const res = await app.request("/api/screenshots?limit=1000");
    const body = (await res.json()) as ScreenshotsListResponse;

    const winner = body.screenshots.find((s) => s.id === creditedId);
    expect(winner?.winner?.voteCount).toBe(7);
    expect(winner?.winner?.source).toBe("announced");

    expect(body.screenshots.find((s) => s.id === ps5Id)?.winner).toBeNull();
  });
});

// M10.8 — the Hall of Fame's endpoint.
describe("GET /api/screenshots/winners", () => {
  test("returns decided weeks newest first, with the screenshot and its credit", async () => {
    const res = await app.request("/api/screenshots/winners?limit=1000");
    expect(res.status).toBe(200);

    const body = (await res.json()) as WinnersResponse;
    const found = body.winners.find((w) => w.screenshot.id === creditedId);

    expect(found?.voteCount).toBe(7);
    expect(found?.source).toBe("announced");
    expect(found?.author?.name).toBe("Nome Visível");
    expect(found?.screenshot.imageUrl).toBe("https://media.game-on-portugal.pt/c.webp");
    expect(JSON.stringify(found)).not.toContain(creditedAuthorId);
  });

  test("withholds a week whose author has opted out of public visibility", async () => {
    // The winner row survives an opt-out on purpose (the contest's history is
    // not rewritten), but the portal must stop showing their content.
    await prisma.privacySetting.create({
      data: { discordId: creditedAuthorId, publicOptOut: true },
    });

    try {
      const res = await app.request("/api/screenshots/winners?limit=1000");
      const body = (await res.json()) as WinnersResponse;

      expect(body.winners.find((w) => w.screenshot.id === creditedId)).toBeUndefined();
      // ...and the count still includes it, so the page can say the history
      // it is showing is incomplete rather than quietly shortening it.
      expect(body.total).toBeGreaterThan(body.winners.length);
    } finally {
      await prisma.privacySetting.deleteMany({ where: { discordId: creditedAuthorId } });
    }
  });
});
