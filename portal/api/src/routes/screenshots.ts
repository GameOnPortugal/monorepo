import { Hono } from "hono";
import { countScreenshots, listScreenshots } from "../repositories/screenshots";
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
