// M8.8's thumbnail endpoint fetches an *origin* image on the caller's behalf
// (see src/lib/thumbnails.ts) — that is exactly the shape of an open image
// proxy / SSRF hole unless the URL it is handed is tightly constrained.
// discord-bot/src/Infrastructure/Media/SafeImageFetcher.ts (+
// Domain/Media/DiscordCdnAllowlist.ts) solves the same class of problem for
// ingest, with a host allowlist as the load-bearing check; this module is
// the portal's own version of that allowlist, not an import of it — the
// portal is a separate deployable with no dependency on discord-bot/src (see
// portal/api/src/db.ts's header for the one deliberate exception, the
// generated Prisma client, which this is not), and discord-bot/src has no
// build step that would let another package import from it anyway.
//
// Three independent restrictions, all required:
// - Host allowlist: only `media.game-on-portugal.pt` (the MinIO bucket
//   behind Caddy, infrastructure/game-on-portugal.yaml) may ever be fetched.
// - Path prefix allowlist: only under the `gop-media` bucket's own prefix —
//   the same host also answers `/console` (MinIO's web UI,
//   `MINIO_BROWSER_REDIRECT_URL`), which this endpoint has no business
//   reaching even read-only.
// - Extension allowlist: only the raster formats screenshots/ad photos are
//   ever stored as. Rejects anything else before a single byte is fetched.
//
// The query string and fragment are deliberately dropped when normalising —
// not just ignored, *removed* — so `?anything=here` cannot be used to mint
// unbounded distinct cache keys for the same underlying object (see
// thumbnails.ts's cache-key comment) or to probe the origin with attacker
// chosen query parameters.
const ALLOWED_HOSTS = new Set(
  (process.env.MEDIA_HOSTS ?? "media.game-on-portugal.pt")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const ALLOWED_PATH_PREFIXES = (process.env.MEDIA_PATH_PREFIXES ?? "/gop-media/")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export class MediaUrlRejected extends Error {}

/**
 * Validate an origin image URL and return a *normalised* URL (origin +
 * pathname only — no query, no fragment) safe to fetch and to use as a cache
 * key. Throws `MediaUrlRejected` with a caller-safe message for anything
 * that fails the host/path/extension allowlist.
 */
export function validateMediaUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MediaUrlRejected("src is not a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new MediaUrlRejected("src must be an https URL");
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new MediaUrlRejected(`host "${parsed.hostname}" is not an allowed media host`);
  }
  if (!ALLOWED_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))) {
    throw new MediaUrlRejected(`path "${parsed.pathname}" is outside the allowed media prefix`);
  }

  const dot = parsed.pathname.lastIndexOf(".");
  const extension = dot === -1 ? "" : parsed.pathname.slice(dot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new MediaUrlRejected(`extension "${extension}" is not an allowed image type`);
  }

  return new URL(parsed.origin + parsed.pathname);
}
