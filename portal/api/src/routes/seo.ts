// M8.13 — sitemap.xml. robots.txt is a static file (portal/web/public/robots.txt)
// since it never needs live data; the sitemap does (marketplace detail pages
// come and go as ads expire/sell/get deleted), so it is generated here and
// proxied through nginx at the site root (see portal/web/docker/nginx.conf's
// `location = /sitemap.xml`) exactly like /api/ and /health already are.
//
// Admin routes are never listed — this only ever walks public, indexable
// pages, and public repository functions already exclude non-public rows
// (repositories/visibility.ts), so there is no risk of a soft-deleted/opted-out
// row leaking into the sitemap.
import { Hono } from "hono";
import { type OriginRequest, resolvePublicOrigin } from "../lib/publicOrigin";
import { publicAdsWhere } from "../repositories/visibility";
import { prisma } from "../db";

export const seo = new Hono();

const STATIC_PATHS = ["/", "/marketplace", "/screenshots", "/screenshots/hall-of-fame", "/trophies"];

/**
 * Sitemap entries are *web* pages, so WEB_ORIGIN wins where it is set (local
 * dev, where the SPA is on another port). The fallback must not be
 * `new URL(c.req.url).origin`: nginx's `location = /sitemap.xml` does not
 * rewrite Host, so that published `http://portal-api:3001/...` — an internal
 * Docker address — to crawlers. See lib/publicOrigin.ts.
 */
function siteOrigin(c: OriginRequest): string {
  return process.env.WEB_ORIGIN || resolvePublicOrigin(c);
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

seo.get("/sitemap.xml", async (c) => {
  const origin = siteOrigin(c);

  // Capped: a sitemap is a crawl hint, not a full export — the newest active
  // listings are what is worth a search engine's attention, not all of
  // history. 500 mirrors repositories/pagination.ts's MAX_LIMIT reasoning.
  const activeAds = await prisma.ad.findMany({
    where: await publicAdsWhere(),
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const urls = [
    ...STATIC_PATHS.map((path) => ({ loc: `${origin}${path}`, lastmod: undefined as string | undefined })),
    ...activeAds.map((ad) => ({
      loc: `${origin}/marketplace/${ad.id}`,
      lastmod: ad.updatedAt.toISOString(),
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return c.body(body, 200, { "Content-Type": "application/xml; charset=utf-8" });
});
