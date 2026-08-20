import { Hono } from "hono";
import { countAds, getAdById, listAds } from "../repositories/ads";
import { parsePagination } from "./pagination";

export const marketplace = new Hono();

marketplace.get("/marketplace/ads", async (c) => {
  const { limit, offset } = parsePagination(c.req.query());
  const adType = c.req.query("adType");
  const status = c.req.query("status");

  const [ads, total] = await Promise.all([
    listAds({ limit, offset, adType, status }),
    countAds({ adType, status }),
  ]);

  return c.json({ ads, total, limit, offset });
});

marketplace.get("/marketplace/ads/:id", async (c) => {
  const ad = await getAdById(c.req.param("id"));
  if (!ad) return c.json({ error: "not found" }, 404);
  return c.json({ ad });
});
