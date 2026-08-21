// bunfig.toml's [test].preload — runs once before any test file. See
// src/audit/db.ts's header for why the audit log needs a path override at
// all during tests.
process.env.AUDIT_DB_PATH ??= ":memory:";

// M8.10 — a default "OAuth is configured" environment so most test files
// don't have to set it up themselves. tests/discordAuth.test.ts's "not
// configured" case deletes these three temporarily and restores them
// immediately after (see that file) — bun runs test files sequentially in
// one process, so that's safe as long as nothing else reads process.env
// concurrently, which nothing here does.
process.env.DISCORD_CLIENT_ID ??= "test-client-id";
process.env.DISCORD_CLIENT_SECRET ??= "test-client-secret";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production-use";
process.env.DISCORD_GUILD_ID ??= "818108848492773377";
