import { Hono } from "hono";
import { cors } from "hono/cors";
import { admin } from "./routes/admin";
import { auth } from "./routes/auth";
import { health } from "./routes/health";
import { marketplace } from "./routes/marketplace";
import { screenshots } from "./routes/screenshots";
import { seo } from "./routes/seo";
import { stats } from "./routes/stats";
import { trophies } from "./routes/trophies";

// M8.10: production is single-origin (nginx proxies /api/ — see
// portal/web/docker/nginx.conf), so CORS only matters for local dev, where
// portal-web (Vite) and portal-api run as two separate processes on two
// ports. `credentials: true` is required for the admin session cookie to
// survive that cross-port fetch — cookies + `credentials: true` cannot pair
// with a wildcard origin (the fetch spec forbids it), so this reflects back
// only an allow-listed origin rather than "*". CORS_ORIGINS defaults to
// Vite's own dev port; production never needs to set it.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Exported separately from index.ts so tests can drive it with `app.request(...)`
// without binding a real port (Hono's `testClient`/`app.fetch` pattern).
export function buildApp(): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? ""),
      credentials: true,
    }),
  );

  app.route("/", health);
  app.route("/", seo);
  app.route("/api", marketplace);
  app.route("/api", screenshots);
  app.route("/api", trophies);
  app.route("/api", stats);
  app.route("/api", auth);
  app.route("/api", admin);

  app.notFound((c) => c.json({ error: "not found" }, 404));

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}
