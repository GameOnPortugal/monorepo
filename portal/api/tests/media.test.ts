import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import sharp from "sharp";
import { buildApp } from "../src/app";

// Route-level coverage for M8.8's thumbnail endpoint. No real network call —
// global.fetch is swapped out per test, matching this repo's "hand-roll
// fakes, no mocking library" convention (see tests/adminAuth.test.ts). A
// tiny synthetic PNG generated with sharp itself stands in for a "real"
// origin image; the exact bytes don't matter, only that it's a valid,
// decodable raster image and that it is meaningfully larger than the
// resized WebP output.
const app = buildApp();
const realFetch = globalThis.fetch;

let sourcePng: Buffer;
const SOURCE_URL = "https://media.game-on-portugal.pt/gop-media/screenshots/test-shot.png";

beforeAll(async () => {
  // 1200x1200 with noise so it doesn't trivially compress to near-nothing —
  // closer to a real photo than a flat colour would be.
  sourcePng = await sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .png()
    .toBuffer();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeOriginFetch(opts: { status?: number; body?: Buffer; contentLength?: number } = {}) {
  let calls = 0;
  const fn = (async (input: string | URL | Request) => {
    calls++;
    const url = typeof input === "string" ? input : input.toString();
    if (!url.startsWith("https://media.game-on-portugal.pt/")) {
      throw new Error(`unexpected fetch in test: ${url}`);
    }
    const status = opts.status ?? 200;
    const body = opts.body ?? sourcePng;
    const headers: Record<string, string> = { "content-type": "image/png" };
    if (opts.contentLength !== undefined) headers["content-length"] = String(opts.contentLength);
    return new Response(status === 200 ? body : null, { status, headers });
  }) as typeof fetch;
  return { fn, callCount: () => calls };
}

describe("GET /api/media/thumbnail", () => {
  test("resizes and re-encodes to a materially smaller WebP", async () => {
    const { fn } = fakeOriginFetch();
    globalThis.fetch = fn;

    const res = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(SOURCE_URL)}&w=320`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeLessThan(sourcePng.byteLength);

    const meta = await sharp(Buffer.from(bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(320);
  });

  test("a second request for the same (src, w) is served from the on-disk cache, not re-fetched", async () => {
    const cacheSrc = `${SOURCE_URL}?cache-probe=${crypto.randomUUID()}`;
    const { fn, callCount } = fakeOriginFetch();
    globalThis.fetch = fn;

    const first = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(cacheSrc)}&w=160`);
    expect(first.status).toBe(200);
    expect(callCount()).toBe(1);

    const second = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(cacheSrc)}&w=160`);
    expect(second.status).toBe(200);
    expect(callCount()).toBe(1); // no new fetch — served from cache

    const firstBytes = new Uint8Array(await first.arrayBuffer());
    const secondBytes = new Uint8Array(await second.arrayBuffer());
    expect(Buffer.from(secondBytes).equals(Buffer.from(firstBytes))).toBe(true);
  });

  test("an arbitrary width is refused rather than resized", async () => {
    const { fn } = fakeOriginFetch();
    globalThis.fetch = fn;
    const res = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(SOURCE_URL)}&w=999`);
    expect(res.status).toBe(400);
  });

  test("a non-media host is refused without ever calling fetch", async () => {
    const { fn, callCount } = fakeOriginFetch();
    globalThis.fetch = fn;
    const res = await app.request(
      `/api/media/thumbnail?src=${encodeURIComponent("https://evil.example.com/x.jpg")}&w=320`,
    );
    expect(res.status).toBe(400);
    expect(callCount()).toBe(0);
  });

  test("a missing src is refused", async () => {
    const res = await app.request("/api/media/thumbnail?w=320");
    expect(res.status).toBe(400);
  });

  test("origin 404 (a dead/removed object) maps to a clear 404, not a hang or a 500", async () => {
    const deadUrl = `${SOURCE_URL.replace("test-shot", "dead-shot")}?probe=${crypto.randomUUID()}`;
    const { fn } = fakeOriginFetch({ status: 404 });
    globalThis.fetch = fn;
    const res = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(deadUrl)}&w=320`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  test("a declared Content-Length over the cap is refused before the body is read", async () => {
    const bigUrl = `${SOURCE_URL.replace("test-shot", "big-shot")}?probe=${crypto.randomUUID()}`;
    const { fn } = fakeOriginFetch({ contentLength: 50 * 1024 * 1024 });
    globalThis.fetch = fn;
    const res = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(bigUrl)}&w=320`);
    expect(res.status).toBe(502);
  });

  test("a 200 response that isn't a decodable image fails cleanly, not with a 500", async () => {
    const junkUrl = `${SOURCE_URL.replace("test-shot", "junk-shot")}?probe=${crypto.randomUUID()}`;
    const { fn } = fakeOriginFetch({ body: Buffer.from("not an image") });
    globalThis.fetch = fn;
    const res = await app.request(`/api/media/thumbnail?src=${encodeURIComponent(junkUrl)}&w=320`);
    expect(res.status).toBe(502);
  });
});
