import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { marketplace } from "./routes/marketplace";
import { screenshots } from "./routes/screenshots";
import { trophies } from "./routes/trophies";

// Exported separately from index.ts so tests can drive it with `app.request(...)`
// without binding a real port (Hono's `testClient`/`app.fetch` pattern).
export function buildApp(): Hono {
  const app = new Hono();

  app.use("*", cors());

  app.route("/", health);
  app.route("/api", marketplace);
  app.route("/api", screenshots);
  app.route("/api", trophies);

  app.notFound((c) => c.json({ error: "not found" }, 404));

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}
