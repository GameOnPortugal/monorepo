import { Hono } from "hono";
import { getLeaderboard } from "../repositories/trophies";

export const trophies = new Hono();

trophies.get("/trophies/leaderboard", async (c) => {
  const limitParam = parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 10;

  const leaderboard = await getLeaderboard(limit);
  return c.json({ leaderboard, limit });
});
