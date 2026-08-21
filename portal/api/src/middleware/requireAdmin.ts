import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { loadOAuthConfig } from "../lib/discordAuth";
import { decodeSession } from "../lib/session";

export const SESSION_COOKIE = "gop_admin_session";

export interface AdminIdentity {
  id: string;
  username: string;
  avatar: string | null;
}

/**
 * Guards every `/api/admin/*` route (see routes/admin.ts). 401s (never
 * redirects — this is an API, the web app owns the "please log in" UX) when:
 *  - OAuth isn't configured at all (no secrets set — see loadOAuthConfig)
 *  - there is no session cookie
 *  - the cookie is malformed, tampered with, or expired
 *
 * On success, stashes the identity on the context under "admin" so route
 * handlers (and the audit log) can read who is making the request without
 * re-decoding the cookie.
 */
export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const config = loadOAuthConfig();
  if (!config) {
    return c.json({ error: "admin auth is not configured" }, 503);
  }

  const token = getCookie(c, SESSION_COOKIE);
  const session = decodeSession(token, config.sessionSecret);
  if (!session) {
    return c.json({ error: "not authenticated" }, 401);
  }

  const admin: AdminIdentity = { id: session.sub, username: session.username, avatar: session.avatar };
  c.set("admin", admin);
  await next();
}

export function getAdmin(c: Context): AdminIdentity {
  const admin = c.get("admin") as AdminIdentity | undefined;
  if (!admin) {
    // Programmer error, not a request error: every route this is called from
    // must be mounted behind requireAdmin. Throwing (rather than returning a
    // sentinel) makes that mistake fail loudly in tests instead of silently
    // attributing a write to "undefined".
    throw new Error("getAdmin() called outside requireAdmin middleware");
  }
  return admin;
}
