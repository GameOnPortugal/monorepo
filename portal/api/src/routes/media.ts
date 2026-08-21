import { Hono } from "hono";
import { DEFAULT_WIDTH, getOrCreateThumbnail, ThumbnailError } from "../lib/thumbnails";

// M8.8's thumbnail endpoint — GET /api/media/thumbnail?src=<origin url>&w=<width>.
// `src` must be a media.game-on-portugal.pt URL under the gop-media bucket
// prefix (see lib/mediaAllowlist.ts) and `w` must be one of the fixed
// ALLOWED_WIDTHS (lib/thumbnails.ts) — both enforced inside
// getOrCreateThumbnail, which is also what owns the on-disk cache. This
// route is just the HTTP shape around it: parse query params, map
// ThumbnailError to the right status, set long-lived cache headers on
// success (the response is content-addressed by (url, width) and screenshots
// are never edited in place, so it is safe to cache "forever").
export const media = new Hono();

media.get("/media/thumbnail", async (c) => {
  const src = c.req.query("src");
  if (!src) {
    return c.json({ error: "src is required" }, 400);
  }

  const widthParam = c.req.query("w");
  const width = widthParam ? Number(widthParam) : DEFAULT_WIDTH;
  if (!Number.isInteger(width)) {
    return c.json({ error: "w must be an integer" }, 400);
  }

  try {
    const thumbnail = await getOrCreateThumbnail(src, width);
    return c.body(new Uint8Array(thumbnail.bytes), 200, {
      "Content-Type": thumbnail.contentType,
      // Immutable: a given (src, width) pair's bytes never change once
      // produced — screenshots are never edited in place, and the cache key
      // already ignores the query string a caller might vary.
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  } catch (error) {
    if (error instanceof ThumbnailError) {
      return c.json({ error: error.message }, error.status as 400 | 404 | 502);
    }
    console.error("thumbnail route error:", error);
    return c.json({ error: "could not produce thumbnail" }, 502);
  }
});
