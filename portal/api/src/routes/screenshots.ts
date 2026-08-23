import { Hono } from "hono";
import { countScreenshots, listScreenshots } from "../repositories/screenshots";
import { countWinners, listWinners } from "../repositories/winners";
import { parsePagination } from "./pagination";

export const screenshots = new Hono();

screenshots.get("/screenshots", async (c) => {
  const { limit, offset } = parsePagination(c.req.query());
  const platform = c.req.query("platform");

  const [items, total] = await Promise.all([
    listScreenshots({ limit, offset, platform }),
    countScreenshots({ platform }),
  ]);

  return c.json({ screenshots: items, total, limit, offset });
});

// M10.8 — the Hall of Fame's data. Its own route rather than a filter on
// `/api/screenshots`, because the row it returns is a *week* (with the
// screenshot attached), not a screenshot with a badge: it carries the week's
// dates, the announced vote count and how the row was obtained, and it is
// ordered by week rather than by when the screenshot was posted.
//
// `total` is the count of decided weeks, which can exceed `winners.length`:
// a week whose screenshot has since been deleted, or whose author opted out,
// is deliberately withheld (see repositories/winners.ts). The page uses the
// difference to say so instead of quietly showing a shorter history.
screenshots.get("/screenshots/winners", async (c) => {
  const { limit } = parsePagination(c.req.query());

  const [winners, total] = await Promise.all([listWinners(limit), countWinners()]);

  return c.json({ winners, total, limit });
});
