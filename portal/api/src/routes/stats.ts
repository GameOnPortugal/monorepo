import { Hono } from "hono";
import { getStats } from "../repositories/stats";

export const stats = new Hono();

stats.get("/stats", async (c) => {
  const value = await getStats();
  return c.json(value);
});
