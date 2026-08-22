import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { encodeSession } from "../src/lib/session";
import { SESSION_COOKIE } from "../src/middleware/requireAdmin";

// Route-level coverage for M8.10: the login redirect, the OAuth callback's
// three outcomes (non-member / member-without-ManageMessages / admin), and
// that /api/admin/* actually enforces the cookie. No real network call to
// Discord — global.fetch is swapped out per test, matching this repo's
// "hand-roll fakes, no mocking library" convention (AGENT.md).
const app = buildApp();
const GUILD_ID = process.env.DISCORD_GUILD_ID!;
const SESSION_SECRET = process.env.SESSION_SECRET!;

const realFetch = globalThis.fetch;

function fakeDiscordFetch(opts: { permissions: string | null; guildId?: string }) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("https://discord.com/api/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "fake-access-token", token_type: "Bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.startsWith("https://discord.com/api/users/@me/guilds")) {
      const guilds =
        opts.permissions === null ? [] : [{ id: opts.guildId ?? GUILD_ID, permissions: opts.permissions }];
      return new Response(JSON.stringify(guilds), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://discord.com/api/users/@me")) {
      return new Response(JSON.stringify({ id: "42", username: "test-user", avatar: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch in test: ${url} ${init?.method ?? "GET"}`);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("GET /api/auth/login", () => {
  test("redirects to Discord's authorize endpoint and sets a state cookie", async () => {
    const res = await app.request("/api/auth/login", { redirect: "manual" });
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://discord.com/api/oauth2/authorize")).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("gop_oauth_state=");
  });

  // Regression: Caddy terminates TLS and reaches portal-api over plain HTTP,
  // so deriving redirect_uri from the request produced
  // `http://game-on-portugal.pt/api/auth/callback` and Discord answered
  // "Invalid OAuth2 redirect_uri" — admin login was impossible in production.
  // The same origin decides the `Secure` cookie flag, so both are pinned here.
  test("builds an https redirect_uri from PUBLIC_ORIGIN even when the request arrives over http", async () => {
    const previous = process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN = "https://game-on-portugal.pt";
    try {
      const res = await app.request("http://portal-api:3001/api/auth/login", { redirect: "manual" });
      expect(res.status).toBe(302);

      const redirectUri = new URL(res.headers.get("location")!).searchParams.get("redirect_uri");
      expect(redirectUri).toBe("https://game-on-portugal.pt/api/auth/callback");

      expect(res.headers.get("set-cookie")).toContain("Secure");
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
      else process.env.PUBLIC_ORIGIN = previous;
    }
  });

  test("falls back to X-Forwarded-Proto when PUBLIC_ORIGIN is not pinned", async () => {
    const previous = process.env.PUBLIC_ORIGIN;
    delete process.env.PUBLIC_ORIGIN;
    try {
      const res = await app.request("http://game-on-portugal.pt/api/auth/login", {
        headers: { "X-Forwarded-Proto": "https" },
        redirect: "manual",
      });

      const redirectUri = new URL(res.headers.get("location")!).searchParams.get("redirect_uri");
      expect(redirectUri).toBe("https://game-on-portugal.pt/api/auth/callback");
    } finally {
      if (previous !== undefined) process.env.PUBLIC_ORIGIN = previous;
    }
  });
});

async function runCallback(permissions: string | null): Promise<Response> {
  globalThis.fetch = fakeDiscordFetch({ permissions });

  const loginRes = await app.request("/api/auth/login", { redirect: "manual" });
  const setCookie = loginRes.headers.get("set-cookie")!;
  const stateCookie = setCookie.split(";")[0]!; // "gop_oauth_state=<uuid>"
  const state = stateCookie.split("=")[1]!;

  return app.request(`/api/auth/callback?code=fake-code&state=${state}`, {
    redirect: "manual",
    headers: { cookie: stateCookie },
  });
}

describe("GET /api/auth/callback", () => {
  test("a non-member is refused (no session cookie set, redirected with an error)", async () => {
    const res = await runCallback(null);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=forbidden");
    expect(res.headers.get("set-cookie") ?? "").not.toContain(`${SESSION_COOKIE}=`);
  });

  test("a member without ManageMessages is refused", async () => {
    const res = await runCallback("0");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=forbidden");
    expect(res.headers.get("set-cookie") ?? "").not.toContain(`${SESSION_COOKIE}=`);
  });

  test("an admin (ManageMessages) is allowed and gets a session cookie", async () => {
    const res = await runCallback("8192"); // MANAGE_MESSAGES_BIT
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).not.toContain("error=");
    expect(res.headers.get("set-cookie") ?? "").toContain(`${SESSION_COOKIE}=`);
  });

  test("rejects a mismatched/forged state", async () => {
    const res = await app.request("/api/auth/callback?code=x&state=forged", {
      headers: { cookie: "gop_oauth_state=different" },
    });
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/* requires a valid session", () => {
  test("401s with no cookie at all", async () => {
    const res = await app.request("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  test("401s with a garbage cookie", async () => {
    const res = await app.request("/api/admin/dashboard", {
      headers: { cookie: `${SESSION_COOKIE}=garbage` },
    });
    expect(res.status).toBe(401);
  });

  test("200s with a validly signed, unexpired session cookie", async () => {
    const token = encodeSession(
      { sub: "1", username: "admin", avatar: null, exp: Date.now() + 60_000 },
      SESSION_SECRET,
    );
    const res = await app.request("/api/admin/dashboard", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
  });

  test("401s with an expired session cookie", async () => {
    const token = encodeSession({ sub: "1", username: "admin", avatar: null, exp: Date.now() - 1 }, SESSION_SECRET);
    const res = await app.request("/api/admin/dashboard", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("degrades safely when OAuth is not configured", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
      SESSION_SECRET: process.env.SESSION_SECRET,
    };
    process.env.DISCORD_CLIENT_ID = "";
    process.env.DISCORD_CLIENT_SECRET = "";
    process.env.SESSION_SECRET = "";
  });

  afterEach(() => {
    process.env.DISCORD_CLIENT_ID = saved.DISCORD_CLIENT_ID;
    process.env.DISCORD_CLIENT_SECRET = saved.DISCORD_CLIENT_SECRET;
    process.env.SESSION_SECRET = saved.SESSION_SECRET;
  });

  test("/api/auth/login answers 503, not a crash", async () => {
    const res = await app.request("/api/auth/login");
    expect(res.status).toBe(503);
  });

  test("/api/admin/* answers 503, not 401 or a crash", async () => {
    const res = await app.request("/api/admin/dashboard");
    expect(res.status).toBe(503);
  });

  test("/api/auth/me reports configured: false rather than erroring", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; authenticated: boolean };
    expect(body).toEqual({ configured: false, authenticated: false });
  });

  test("public routes are entirely unaffected", async () => {
    const res = await app.request("/api/stats");
    expect(res.status).toBe(200);
  });
});
