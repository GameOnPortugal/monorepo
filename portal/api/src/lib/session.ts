// M8.10 — signed, stateless admin sessions.
//
// No session table, on purpose: GLOBAL-PLAN's hard constraint for this
// milestone is "the bot owns the database schema" — if a feature needs a new
// table, that is a discord-bot/prisma migration this agent cannot make (see
// portal/README.md and docs/plans/GLOBAL-PLAN.md M8.11's decision note for
// the audit log, which hits the same constraint). A session store would need
// exactly that kind of table (or an external cache this stack does not have -
// there is no Redis here, see docs/operations.md). So instead the session is
// the payload itself, HMAC-signed and held only in an httpOnly cookie: the
// server verifies the signature and expiry on every request and never looks
// anything up. This is the same "no new attack surface, no new storage"
// reasoning docs/plans/03-portal.md's "Auth" section already used to justify
// Discord OAuth over a password table.
//
// Cookie value shape: `${base64url(json)}.${base64url(hmacSha256(json))}`.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface AdminSession {
  /** Discord user id (snowflake). Never a bare "username" — ids don't change. */
  sub: string;
  username: string;
  avatar: string | null;
  /** Unix ms expiry. */
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSession(session: AdminSession, secret: string): string {
  const payload = base64url(JSON.stringify(session));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * Verifies the signature and expiry. Returns `null` on anything wrong
 * (missing, malformed, tampered, expired) — callers treat every failure mode
 * identically (not authenticated), so there is no branch that leaks *why* a
 * cookie was rejected.
 */
export function decodeSession(token: string | undefined | null, secret: string): AdminSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload, secret);

  // Lengths differ for a tampered/garbage token often enough that a plain
  // `!==` would already be safe here, but timingSafeEqual is cheap and this
  // is exactly the kind of comparison it exists for.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as AdminSession;
    if (typeof session.exp !== "number" || Date.now() >= session.exp) return null;
    if (typeof session.sub !== "string" || typeof session.username !== "string") return null;
    return session;
  } catch {
    return null;
  }
}
