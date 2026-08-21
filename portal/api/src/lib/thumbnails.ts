// M8.8's thumbnail endpoint — the (a) option from the GLOBAL-PLAN M8.8 row's
// three ways to close the "a phone downloads a full-size image per grid
// tile" gap: "a resize endpoint in portal/api with a cache, which stays
// entirely inside portal/ and touches neither the bot nor infrastructure".
//
// Measured against production (2026-08-20 sampling, recorded in the M8.8
// row): median 392 KB, p90 984 KB, max 2.2 MB per screenshot, so a 24-tile
// grid was ~9 MB at the median and ~23 MB at p90. This resizes to a small
// fixed set of widths and re-encodes to WebP, then caches the result on
// disk — every repeat request for the same (url, width) pair is served from
// disk, never re-fetched or re-encoded.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { rename, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { validateMediaUrl } from "./mediaAllowlist";

// A small *fixed* set, not an arbitrary `?w=` — an open resize endpoint is
// both a cache-blowup vector (unbounded distinct cache entries) and a CPU-DoS
// vector (sharp decoding+resizing is not free). 160/320/480 cover the
// gallery grid's CSS tile sizes at up to ~2x pixel density (see
// portal/web/src/pages/Screenshots.tsx's grid — 2 cols on a 375px phone up
// to 6 cols on the max-w-6xl desktop layout, tiles roughly 160-200 CSS px
// wide either way).
export const ALLOWED_WIDTHS = [160, 320, 480] as const;
export type AllowedWidth = (typeof ALLOWED_WIDTHS)[number];
export const DEFAULT_WIDTH: AllowedWidth = 320;

export function isAllowedWidth(value: number): value is AllowedWidth {
  return (ALLOWED_WIDTHS as readonly number[]).includes(value);
}

// Generous relative to the measured p90/max (984 KB / 2.2 MB) so a legitimate
// origin image is never rejected, small enough to bound memory per request —
// same shape as discord-bot's SafeImageFetcher.DEFAULT_SAFE_IMAGE_FETCHER_OPTIONS,
// duplicated rather than imported (see mediaAllowlist.ts's header for why).
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const WEBP_QUALITY = 75;

// 624 screenshots × 3 widths ≈ 1,872 entries at steady state (a few tens of
// KB each per the task brief — well under a GB). This is a hard ceiling far
// above that, so it never bites in normal operation, but it stops the cache
// growing without bound if this endpoint is ever hit with many distinct
// *valid* media URLs (e.g. every screenshot ever ingested, replayed
// repeatedly) — width is already capped to 3 values, this caps the other
// axis (distinct source URLs actually resolved).
const MAX_CACHE_ENTRIES = 5000;

export class ThumbnailError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function cacheDir(): string {
  return process.env.THUMBNAIL_CACHE_DIR ?? "./data/thumbnails";
}

function cachePathFor(url: URL, width: AllowedWidth): string {
  const key = createHash("sha256").update(`${url.toString()}|w=${width}`).digest("hex");
  return join(cacheDir(), `${key}.webp`);
}

async function readCached(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * Bound the cache directory's entry count. Deletes the single oldest file
 * (by mtime) when at/over the cap, called just before a new entry is
 * written — cheap (one `readdirSync`+`statSync` sweep) at this cache's
 * expected size, and simplicity is worth more here than an LRU structure for
 * a cache that should almost never approach the cap at all.
 */
function evictIfOverCap(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // Directory doesn't exist yet — nothing to evict.
  }
  if (entries.length < MAX_CACHE_ENTRIES) return;

  let oldestName: string | undefined;
  let oldestMtime = Infinity;
  for (const name of entries) {
    const full = join(dir, name);
    try {
      const mtime = statSync(full).mtimeMs;
      if (mtime < oldestMtime) {
        oldestMtime = mtime;
        oldestName = name;
      }
    } catch {
      // Raced with another eviction/write — ignore and keep scanning.
    }
  }
  if (oldestName) {
    try {
      unlinkSync(join(dir, oldestName));
    } catch {
      // Already gone — fine.
    }
  }
}

/** Fetch an already-validated media URL with the same size/timeout guards SafeImageFetcher uses. */
async function fetchSource(url: URL): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ThumbnailError(`origin did not respond within ${FETCH_TIMEOUT_MS}ms`, 502);
    }
    throw new ThumbnailError(`origin fetch failed: ${(error as Error).message}`, 502);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    // The two known-dead 2022 Discord CDN links (task brief) never resolve
    // through this endpoint at all — they aren't re-hosted at
    // media.game-on-portugal.pt, so they fail mediaAllowlist's host check
    // first. This 404 branch is what happens if a *rehosted* object is
    // itself missing from the bucket (deleted out from under a still-live
    // DB row) — same "fail clearly, don't 500" contract either way.
    throw new ThumbnailError("source image not found", 404);
  }
  if (!response.ok) {
    throw new ThumbnailError(`origin responded ${response.status}`, 502);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new ThumbnailError("source image exceeds the size cap", 502);
  }

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) {
      throw new ThumbnailError("source image exceeds the size cap", 502);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new ThumbnailError("source image exceeds the size cap", 502);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export interface Thumbnail {
  bytes: Buffer;
  contentType: "image/webp";
}

/**
 * The one entry point routes/media.ts calls. `src` is caller-controlled
 * input and is validated (host/path/extension) before anything else
 * happens — see mediaAllowlist.ts. Returns from disk on a cache hit;
 * otherwise fetches, resizes, writes the cache file (atomic rename, so a
 * concurrent reader never sees a partial file), and returns.
 */
export async function getOrCreateThumbnail(src: string, width: number): Promise<Thumbnail> {
  if (!isAllowedWidth(width)) {
    throw new ThumbnailError(`width must be one of ${ALLOWED_WIDTHS.join(", ")}`, 400);
  }

  let url: URL;
  try {
    url = validateMediaUrl(src);
  } catch (error) {
    throw new ThumbnailError((error as Error).message, 400);
  }

  const dir = cacheDir();
  const path = cachePathFor(url, width);

  const cached = await readCached(path);
  if (cached) {
    return { bytes: cached, contentType: "image/webp" };
  }

  const source = await fetchSource(url);

  let resized: Buffer;
  try {
    resized = await sharp(source)
      .rotate() // Auto-orient from EXIF before the orientation tag is stripped.
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    // A corrupt file, or a 200 response that isn't actually an image (e.g.
    // MinIO answering with an XML error body under a 200 in some failure
    // modes) — sharp throws either way. Fail clearly rather than serving a
    // broken image or crashing the request.
    throw new ThumbnailError(`could not decode source image: ${(error as Error).message}`, 502);
  }

  try {
    mkdirSync(dir, { recursive: true });
    evictIfOverCap(dir);
    // Write-then-rename: a reader that opens the final path never observes a
    // partially-written file, even under concurrent requests for the same
    // (url, width) racing each other.
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, resized);
    await rename(tmpPath, path);
  } catch (error) {
    // The cache is an optimisation, not a correctness requirement — a write
    // failure (e.g. a full/read-only volume) shouldn't turn a successful
    // resize into a 500. Log and serve the bytes we already have.
    console.error("thumbnail cache write failed:", error);
  }

  return { bytes: resized, contentType: "image/webp" };
}

/** Test-only: point the cache at a fresh directory and unused between tests. */
export function resolveThumbnailCacheDirForTests(): string {
  return dirname(cachePathFor(new URL("https://media.game-on-portugal.pt/gop-media/x.jpg"), DEFAULT_WIDTH));
}
