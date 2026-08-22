import { afterEach, describe, expect, test } from "bun:test";
import { resolvePublicOrigin } from "../src/lib/publicOrigin";

/** A stand-in for Hono's Context carrying only what resolvePublicOrigin reads. */
function ctx(url: string, headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { req: { url, header: (name: string) => lower[name.toLowerCase()] } };
}

const ORIGINAL = process.env.PUBLIC_ORIGIN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = ORIGINAL;
});

describe("resolvePublicOrigin", () => {
  test("uses the request's own origin when nothing proxies (local dev)", () => {
    delete process.env.PUBLIC_ORIGIN;
    expect(resolvePublicOrigin(ctx("http://localhost:3001/api/auth/login"))).toBe("http://localhost:3001");
  });

  test("PUBLIC_ORIGIN wins over both the request and forwarded headers", () => {
    process.env.PUBLIC_ORIGIN = "https://game-on-portugal.pt";
    const c = ctx("http://portal-api:3001/sitemap.xml", {
      "x-forwarded-proto": "http",
      "x-forwarded-host": "evil.example",
    });
    expect(resolvePublicOrigin(c)).toBe("https://game-on-portugal.pt");
  });

  test("trims a trailing slash off PUBLIC_ORIGIN so callers can concatenate paths", () => {
    process.env.PUBLIC_ORIGIN = "https://game-on-portugal.pt/";
    expect(resolvePublicOrigin(ctx("http://portal-api:3001/"))).toBe("https://game-on-portugal.pt");
  });

  // The production regression: Caddy terminates TLS, so the scheme on the
  // socket is http and only X-Forwarded-Proto knows the truth. Getting this
  // wrong sent Discord an http:// redirect_uri and it answered
  // "Invalid OAuth2 redirect_uri".
  test("recovers https from X-Forwarded-Proto when PUBLIC_ORIGIN is unset", () => {
    delete process.env.PUBLIC_ORIGIN;
    const c = ctx("http://game-on-portugal.pt/api/auth/login", { "x-forwarded-proto": "https" });
    expect(resolvePublicOrigin(c)).toBe("https://game-on-portugal.pt");
  });

  // nginx's `location = /sitemap.xml` did not rewrite Host, so the sitemap
  // published the internal Docker address to crawlers.
  test("prefers X-Forwarded-Host over an internal Host", () => {
    delete process.env.PUBLIC_ORIGIN;
    const c = ctx("http://portal-api:3001/sitemap.xml", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "game-on-portugal.pt",
    });
    expect(resolvePublicOrigin(c)).toBe("https://game-on-portugal.pt");
  });

  test("reads only the client-facing hop of a proxy chain", () => {
    delete process.env.PUBLIC_ORIGIN;
    const c = ctx("http://portal-api:3001/sitemap.xml", {
      "x-forwarded-proto": "https, http",
      "x-forwarded-host": "game-on-portugal.pt, portal-api:3001",
    });
    expect(resolvePublicOrigin(c)).toBe("https://game-on-portugal.pt");
  });

  test("ignores a non-http(s) X-Forwarded-Proto", () => {
    delete process.env.PUBLIC_ORIGIN;
    const c = ctx("http://game-on-portugal.pt/api/auth/login", { "x-forwarded-proto": "javascript" });
    expect(resolvePublicOrigin(c)).toBe("http://game-on-portugal.pt");
  });

  test("ignores an X-Forwarded-Host carrying anything but host[:port]", () => {
    delete process.env.PUBLIC_ORIGIN;
    const c = ctx("http://game-on-portugal.pt/api/auth/login", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "evil.example/path?x=1",
    });
    expect(resolvePublicOrigin(c)).toBe("https://game-on-portugal.pt");
  });
});
