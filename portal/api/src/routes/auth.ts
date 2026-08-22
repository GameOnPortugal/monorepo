// M8.10 — Discord OAuth2 login/callback/logout for the admin shell.
//
// Degrades safely, matching the bot's InMemoryClient-when-no-token pattern
// (AGENT.md "Traps"): every route here checks `loadOAuthConfig()` first and
// returns 503 rather than throwing when DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET/
// SESSION_SECRET are unset. Nothing else in portal-api depends on this file —
// the public routes (marketplace/screenshots/trophies/stats) never import it.
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  buildAuthorizeUrl,
  computeAdminStatus,
  exchangeCodeForToken,
  fetchDiscordGuilds,
  fetchDiscordUser,
  loadOAuthConfig,
} from "../lib/discordAuth";
import { type OriginRequest, resolvePublicOrigin } from "../lib/publicOrigin";
import { encodeSession } from "../lib/session";
import { SESSION_COOKIE } from "../middleware/requireAdmin";
import { decodeSession } from "../lib/session";

export const auth = new Hono();

const STATE_COOKIE = "gop_oauth_state";

/**
 * Where the API lives from the browser's point of view, to build redirect_uri.
 *
 * Behind Caddy + nginx the inbound request is plain HTTP, so this cannot be
 * read off `c.req.url` — doing so sent Discord an `http://` redirect_uri it
 * refuses. See lib/publicOrigin.ts for the full reasoning and the env var
 * production pins.
 */
function apiOrigin(c: OriginRequest): string {
  return resolvePublicOrigin(c);
}

/**
 * Where to send the browser back to after login/forbidden. Same-origin
 * production topology (nginx proxies /api/ — see portal/web/docker/nginx.conf)
 * means the web app and the API share an origin, so this is just that origin;
 * WEB_ORIGIN only needs to differ from apiOrigin() in local dev, where
 * portal-web (Vite, :5173) and portal-api (:3001) are two separate processes.
 */
function webOrigin(c: OriginRequest): string {
  return process.env.WEB_ORIGIN || apiOrigin(c);
}

auth.get("/auth/config", (c) => {
  return c.json({ configured: loadOAuthConfig() !== null });
});

auth.get("/auth/login", (c) => {
  const config = loadOAuthConfig();
  if (!config) return c.json({ error: "admin auth is not configured" }, 503);

  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: apiOrigin(c).startsWith("https://"),
    sameSite: "Lax",
    maxAge: 600, // 10 minutes — just long enough to complete the Discord redirect round trip.
    path: "/",
  });

  const redirectUri = `${apiOrigin(c)}/api/auth/callback`;
  return c.redirect(buildAuthorizeUrl(config, redirectUri, state));
});

auth.get("/auth/callback", async (c) => {
  const config = loadOAuthConfig();
  if (!config) return c.json({ error: "admin auth is not configured" }, 503);

  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return c.json({ error: "invalid oauth state" }, 400);
  }

  try {
    const redirectUri = `${apiOrigin(c)}/api/auth/callback`;
    const accessToken = await exchangeCodeForToken(config, code, redirectUri);
    const [user, guilds] = await Promise.all([fetchDiscordUser(accessToken), fetchDiscordGuilds(accessToken)]);
    const { isAdmin } = computeAdminStatus(guilds, config.guildId);

    if (!isAdmin) {
      // Not a member, or a member without ManageMessages — same outward
      // response either way (see discordAuth.ts's computeAdminStatus doc):
      // this endpoint never reveals which one it was, so a stranger probing
      // it cannot learn whether "not in the guild" or "in the guild, not an
      // admin" is the reason.
      return c.redirect(`${webOrigin(c)}/admin?error=forbidden`);
    }

    const session = encodeSession(
      { sub: user.id, username: user.username, avatar: user.avatar, exp: Date.now() + config.sessionTtlMs },
      config.sessionSecret,
    );
    setCookie(c, SESSION_COOKIE, session, {
      httpOnly: true,
      secure: apiOrigin(c).startsWith("https://"),
      sameSite: "Lax",
      maxAge: Math.floor(config.sessionTtlMs / 1000),
      path: "/",
    });

    return c.redirect(`${webOrigin(c)}/admin`);
  } catch (error) {
    console.error("oauth callback failed", error);
    return c.redirect(`${webOrigin(c)}/admin?error=oauth_failed`);
  }
});

auth.post("/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/auth/me", (c) => {
  const config = loadOAuthConfig();
  if (!config) return c.json({ authenticated: false, configured: false });

  const session = decodeSession(getCookie(c, SESSION_COOKIE), config.sessionSecret);
  if (!session) return c.json({ authenticated: false, configured: true });

  return c.json({
    authenticated: true,
    configured: true,
    user: { id: session.sub, username: session.username, avatar: session.avatar },
  });
});
