import { Hono } from "hono";
import { prisma } from "../db";

export const health = new Hono();

health.get("/health", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok", service: "portal-api", time: new Date().toISOString() });
  } catch (error) {
    return c.json(
      {
        status: "error",
        service: "portal-api",
        error: error instanceof Error ? error.message : "unknown error",
      },
      503,
    );
  }
});
