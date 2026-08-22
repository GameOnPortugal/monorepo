// Where this API lives *from the browser's point of view*.
//
// In production two reverse proxies sit in front of this process: Caddy
// terminates TLS and speaks plain HTTP to nginx
// (infrastructure/caddy/game-on-portugal.pt.caddy), and nginx proxies /api/,
// /health and /sitemap.xml through to portal-api
// (portal/web/docker/nginx.conf). Hono builds `c.req.url` from the actual
// socket scheme and the inbound Host header, so on that path it reports
// `http://` — and for the `location = /sitemap.xml` block, which does not
// rewrite Host, an authority of `portal-api:3001`.
//
// Deriving a public URL from `c.req.url` therefore produced three real
// production defects at once:
//   - an `http://game-on-portugal.pt/api/auth/callback` OAuth redirect_uri,
//     which Discord rejects outright ("Invalid OAuth2 redirect_uri") because
//     the registered URI is https — admin login was impossible;
//   - session/state cookies emitted without `Secure`, since routes/auth.ts
//     decides that flag by testing the origin for an https prefix;
//   - a sitemap advertising `http://portal-api:3001/...` to crawlers.
//
// Resolution order, most trustworthy first:
//   1. PUBLIC_ORIGIN — an explicit statement of the public base URL. Set it in
//      production (infrastructure/game-on-portugal.yaml) so nothing is
//      inferred from attacker-controllable headers.
//   2. X-Forwarded-Proto / X-Forwarded-Host — what Caddy actually saw. Only
//      consulted when PUBLIC_ORIGIN is unset, and only as a best effort.
//   3. `c.req.url`'s own origin — the right answer in local dev, where nothing
//      proxies and the socket scheme is the real scheme.
//
// Note on trust: forwarded headers are client-supplied and can be spoofed by
// anyone who reaches this process directly. That is why production pins
// PUBLIC_ORIGIN rather than relying on step 2. Even unpinned, a spoofed host
// cannot widen OAuth — Discord only accepts a redirect_uri that exactly
// matches one registered on the application.

/** The subset of Hono's Context this needs; keeps the helper trivially testable. */
export interface OriginRequest {
  req: {
    url: string;
    header(name: string): string | undefined;
  };
}

/** `X-Forwarded-*` may carry a proxy chain ("https, http") — the client-facing hop is first. */
function firstHop(value: string | undefined): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first ? first : undefined;
}

/**
 * Rejects anything that is not a bare `host` or `host:port`, so a hostile
 * X-Forwarded-Host cannot smuggle a path, query or second authority into a
 * string we go on to concatenate URLs onto.
 */
function isSafeHost(host: string): boolean {
  return /^[A-Za-z0-9.-]+(:\d+)?$/.test(host);
}

export function stripTrailingSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/**
 * The public origin of this API, without a trailing slash — e.g.
 * `https://game-on-portugal.pt`.
 */
export function resolvePublicOrigin(c: OriginRequest): string {
  const configured = process.env.PUBLIC_ORIGIN?.trim();
  if (configured) return stripTrailingSlash(configured);

  const direct = new URL(c.req.url);

  const forwardedProto = firstHop(c.req.header("x-forwarded-proto"));
  const proto =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : direct.protocol.replace(/:$/, "");

  const forwardedHost = firstHop(c.req.header("x-forwarded-host"));
  const host = forwardedHost && isSafeHost(forwardedHost) ? forwardedHost : direct.host;

  return `${proto}://${host}`;
}
