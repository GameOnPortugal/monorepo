import { Hono } from "hono";
import { getHunter, getLeaderboard } from "../repositories/trophies";

export const trophies = new Hono();

trophies.get("/trophies/leaderboard", async (c) => {
  const limitParam = parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 10;

  const leaderboard = await getLeaderboard(limit);
  return c.json({ leaderboard, limit });
});

// M11 — one hunter's platinum list, behind the same visibility filter as the
// leaderboard: a profile that is excluded or has opted out 404s here exactly
// as it is absent there, so this route can never be used to look someone up
// who chose not to be listed.
trophies.get("/trophies/hunters/:psnProfile", async (c) => {
  const hunter = await getHunter(c.req.param("psnProfile"));
  if (!hunter) return c.json({ error: "not found" }, 404);
  return c.json({ hunter });
});
