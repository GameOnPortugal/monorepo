// M8.10 — Discord OAuth2 + the admin definition, kept in lockstep with the
// bot's own definition.
//
// discord-bot/src/Domain/Bot/AdminCheck.ts's `isGuildAdmin()` is "the invoking
// member has `ManageMessages` in the guild" — read off `interaction.member`,
// which discord.js populates from the gateway. The portal has no gateway
// connection and no bot token (see portal/README.md "Schema ownership" — this
// service only ever had a database connection before M8.10); it has an
// end-user's own OAuth access token instead. Discord's
// `GET /users/@me/guilds` returns, per guild the user is in, a `permissions`
// field: "the permissions the user has in that guild, as a string bitwise
// value" (identical semantics to `member.permissions`, just delivered over a
// different API). Reading that bit is therefore the same check as
// `isGuildAdmin()`, not a second, drifting definition of "admin" — this file
// is the one place it is decoded on the portal side, exactly as
// AdminCheck.ts is the one place on the bot side.
//
// MANAGE_MESSAGES = 1 << 13 (0x2000) — a stable, documented Discord
// permission bit (https://discord.com/developers/docs/topics/permissions),
// the same value discord.js's `PermissionFlagsBits.ManageMessages` resolves
// to. Not imported from discord.js: portal/api has no dependency on it (this
// service isn't a bot client, see db.ts's header), and pulling in the whole
// package for one bigint constant would be a strange trade.
export const MANAGE_MESSAGES_BIT = 0x2000n;

// discord.js's `PermissionsBitField#has()` — what AdminCheck.ts's
// `isGuildAdmin()` actually calls (`bitfield.has(PermissionFlagsBits.ManageMessages)`)
// — treats ADMINISTRATOR as satisfying *any* permission check by default
// (`checkAdmin` defaults to `true`), not just a literal ManageMessages bit.
// Mirroring `isGuildAdmin()` faithfully means mirroring that too, or a guild
// owner/administrator without the individual ManageMessages bit explicitly
// granted would pass the bot's check and fail the portal's.
export const ADMINISTRATOR_BIT = 0x8n;

export const DEFAULT_GUILD_ID = "818108848492773377"; // discord-bot/.env.example's verified production guild.

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  guildId: string;
  sessionSecret: string;
  /** How long an admin session is valid for, in ms. */
  sessionTtlMs: number;
}

/**
 * Reads OAuth config from the environment. Returns `null` when any required
 * secret is unset — the caller (routes/auth.ts) uses this to degrade safely:
 * every public page and public API route works with no Discord app
 * registered at all, exactly like the bot binding `InMemoryClient` when
 * `DISCORD_TOKEN` is absent (AGENT.md "Traps"). Only `/api/auth/*` and
 * `/api/admin/*` are unavailable (503) without it.
 */
export function loadOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig | null {
  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const sessionSecret = env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) return null;

  const guildId = env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;
  const ttlHours = Number(env.SESSION_TTL_HOURS ?? "12");
  const sessionTtlMs = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 12) * 60 * 60 * 1000;

  return { clientId, clientSecret, guildId, sessionSecret, sessionTtlMs };
}

export function buildAuthorizeUrl(config: OAuthConfig, redirectUri: string, state: string): string {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  // `identify` for the user's id/username/avatar, `guilds` for
  // `/users/@me/guilds` (membership + per-guild permissions). Never
  // `guilds.members.read` or `bot` — this app does not need, and must not
  // request, anything beyond "who is this and what can they do in one guild".
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "none");
  return url.toString();
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
}

export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as DiscordTokenResponse;
  return json.access_token;
}

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord /users/@me failed: ${res.status}`);
  const json = (await res.json()) as { id: string; username: string; avatar: string | null };
  return { id: json.id, username: json.username, avatar: json.avatar };
}

export interface DiscordPartialGuild {
  id: string;
  /** Bitwise permission flags of the user in this guild, as a decimal string. */
  permissions: string;
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordPartialGuild[]> {
  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord /users/@me/guilds failed: ${res.status}`);
  return (await res.json()) as DiscordPartialGuild[];
}

export interface AdminStatus {
  isMember: boolean;
  isAdmin: boolean;
}

/**
 * The pure, unit-testable half of the admin check — everything above this
 * function talks to Discord's HTTP API; this does not. Given the guild list
 * `GET /users/@me/guilds` returned and the one guild id that matters, decide
 * membership and admin status. Mirrors `isGuildAdmin()`
 * (discord-bot/src/Domain/Bot/AdminCheck.ts) bit-for-bit: no guild membership
 * -> false; member without ManageMessages -> false; member with
 * ManageMessages -> true.
 */
export function computeAdminStatus(guilds: DiscordPartialGuild[], guildId: string): AdminStatus {
  const membership = guilds.find((g) => g.id === guildId);
  if (!membership) return { isMember: false, isAdmin: false };

  let bitfield: bigint;
  try {
    bitfield = BigInt(membership.permissions);
  } catch {
    return { isMember: true, isAdmin: false };
  }

  const hasManageMessages = (bitfield & MANAGE_MESSAGES_BIT) === MANAGE_MESSAGES_BIT;
  const hasAdministrator = (bitfield & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT;
  return { isMember: true, isAdmin: hasManageMessages || hasAdministrator };
}
