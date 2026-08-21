import { describe, expect, test } from "bun:test";
import {
  ADMINISTRATOR_BIT,
  computeAdminStatus,
  loadOAuthConfig,
  MANAGE_MESSAGES_BIT,
} from "../src/lib/discordAuth";

const GUILD_ID = "818108848492773377";
const OTHER_GUILD_ID = "999999999999999999";

// The three cases the task brief requires at minimum: a non-member is
// refused, a member without ManageMessages is refused, an admin is allowed —
// mirroring discord-bot/src/Domain/Bot/AdminCheck.ts's isGuildAdmin() (see
// discordAuth.ts's header for exactly how). No network involved: this is the
// pure half of the check, called after Discord's API has already answered.
describe("computeAdminStatus", () => {
  test("a non-member (not in the guild at all) is refused", () => {
    const status = computeAdminStatus([{ id: OTHER_GUILD_ID, permissions: "8" }], GUILD_ID);
    expect(status).toEqual({ isMember: false, isAdmin: false });
  });

  test("no guilds at all is refused", () => {
    const status = computeAdminStatus([], GUILD_ID);
    expect(status).toEqual({ isMember: false, isAdmin: false });
  });

  test("a member without ManageMessages is refused", () => {
    // Some unrelated bit (VIEW_CHANNEL = 0x400) set, but not ManageMessages
    // or Administrator.
    const status = computeAdminStatus([{ id: GUILD_ID, permissions: "1024" }], GUILD_ID);
    expect(status).toEqual({ isMember: true, isAdmin: false });
  });

  test("a member with no permissions at all is refused", () => {
    const status = computeAdminStatus([{ id: GUILD_ID, permissions: "0" }], GUILD_ID);
    expect(status).toEqual({ isMember: true, isAdmin: false });
  });

  test("a member with ManageMessages is allowed", () => {
    const status = computeAdminStatus([{ id: GUILD_ID, permissions: MANAGE_MESSAGES_BIT.toString() }], GUILD_ID);
    expect(status).toEqual({ isMember: true, isAdmin: true });
  });

  test("ManageMessages combined with other bits is still allowed", () => {
    const permissions = (MANAGE_MESSAGES_BIT | 0x400n).toString();
    const status = computeAdminStatus([{ id: GUILD_ID, permissions }], GUILD_ID);
    expect(status).toEqual({ isMember: true, isAdmin: true });
  });

  test("a guild owner/Administrator without the literal ManageMessages bit is still allowed", () => {
    // Mirrors discord.js PermissionsBitField#has()'s default checkAdmin=true
    // behaviour, which is what isGuildAdmin() actually relies on.
    const status = computeAdminStatus([{ id: GUILD_ID, permissions: ADMINISTRATOR_BIT.toString() }], GUILD_ID);
    expect(status).toEqual({ isMember: true, isAdmin: true });
  });

  test("membership in a different guild than the configured one does not count", () => {
    const status = computeAdminStatus(
      [
        { id: OTHER_GUILD_ID, permissions: MANAGE_MESSAGES_BIT.toString() },
        { id: GUILD_ID, permissions: "0" },
      ],
      GUILD_ID,
    );
    expect(status).toEqual({ isMember: true, isAdmin: false });
  });

  test("an unparsable permissions string degrades to non-admin rather than throwing", () => {
    const status = computeAdminStatus([{ id: GUILD_ID, permissions: "not-a-number" }], GUILD_ID);
    expect(status).toEqual({ isMember: true, isAdmin: false });
  });
});

describe("loadOAuthConfig", () => {
  test("returns a config when every required secret is set (preload.ts sets test defaults)", () => {
    expect(loadOAuthConfig()).not.toBeNull();
  });

  test("degrades to null — not a throw — when any required secret is missing", () => {
    // The feature must degrade safely, the same way the bot binds
    // InMemoryClient when DISCORD_TOKEN is unset (AGENT.md "Traps").
    expect(loadOAuthConfig({})).toBeNull();
    expect(loadOAuthConfig({ DISCORD_CLIENT_ID: "x" })).toBeNull();
    expect(loadOAuthConfig({ DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "y" })).toBeNull();
  });

  test("defaults the guild id to the verified production guild when unset", () => {
    const config = loadOAuthConfig({
      DISCORD_CLIENT_ID: "x",
      DISCORD_CLIENT_SECRET: "y",
      SESSION_SECRET: "z",
    });
    expect(config?.guildId).toBe(GUILD_ID);
  });
});
