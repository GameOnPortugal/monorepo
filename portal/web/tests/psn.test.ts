import { describe, expect, test } from "bun:test";
import { gameFromTrophyUrl, monogram, monogramColor, psnProfileUrl } from "../src/lib/psn";

/**
 * The hunter page's whole game list is derived from these functions — there
 * is no game column in the schema, only `trophies.url` — so a regression here
 * silently turns every platinum into an unnamed "Platina" rather than
 * throwing. Hence tests against the real URL shapes the bot stores.
 */
describe("gameFromTrophyUrl", () => {
  test("recovers id, slug and a readable title from a stored trophy URL", () => {
    const game = gameFromTrophyUrl("https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes");

    expect(game).not.toBeNull();
    expect(game?.id).toBe("11783");
    expect(game?.slug).toBe("assassins-creed-valhalla");
    expect(game?.title).toBe("Assassins Creed Valhalla");
    // The game's own page — the profile segment is dropped.
    expect(game?.url).toBe("https://psnprofiles.com/trophies/11783-assassins-creed-valhalla");
  });

  test("upper-cases roman numerals instead of title-casing them", () => {
    expect(gameFromTrophyUrl("https://psnprofiles.com/trophies/12-grand-theft-auto-iv/Zephyr-pt")?.title).toBe(
      "Grand Theft Auto IV",
    );
  });

  test("keeps small words lower-case mid-title but not at the start", () => {
    expect(gameFromTrophyUrl("https://psnprofiles.com/trophies/1-the-last-of-us/Someone")?.title).toBe(
      "The Last of Us",
    );
  });

  test("handles a URL with no trailing profile segment", () => {
    expect(gameFromTrophyUrl("https://psnprofiles.com/trophies/11783-assassins-creed-valhalla")?.title).toBe(
      "Assassins Creed Valhalla",
    );
  });

  test("returns null rather than inventing a title for anything unrecognised", () => {
    expect(gameFromTrophyUrl(null)).toBeNull();
    expect(gameFromTrophyUrl("")).toBeNull();
    expect(gameFromTrophyUrl("https://psnprofiles.com/Josh_Lopes")).toBeNull();
    expect(gameFromTrophyUrl("not a url at all")).toBeNull();
    // No numeric id in the path segment — not the shape we know how to read.
    expect(gameFromTrophyUrl("https://psnprofiles.com/trophies/assassins-creed/Josh")).toBeNull();
  });
});

describe("psnProfileUrl", () => {
  test("encodes the profile, which is un-validated free text in the database", () => {
    expect(psnProfileUrl("Josh_Lopes")).toBe("https://psnprofiles.com/Josh_Lopes");
    expect(psnProfileUrl("a b/c")).toBe("https://psnprofiles.com/a%20b%2Fc");
  });
});

describe("monogram", () => {
  test("takes the first character, upper-cased", () => {
    expect(monogram("rui_pt")).toBe("R");
    expect(monogram("  spaced")).toBe("S");
  });

  test("falls back to ? for an empty name rather than rendering blank", () => {
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
  });

  test("is stable: the same name always gets the same colour", () => {
    expect(monogramColor("rui_pt")).toBe(monogramColor("rui_pt"));
    // And it is always one of the four brand accents, never an invented fifth.
    expect(monogramColor("anything")).toMatch(/^var\(--color-accent-(blue|mint|yellow|red)\)$/);
  });
});
