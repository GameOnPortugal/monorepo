/**
 * The platform → colour mapping. THE single place it is defined — see
 * docs/plans/03-portal.md: "The four button colours are the platform
 * palette... Assign the mapping once, in one place, and never vary it."
 *
 * Every component that needs a platform's colour imports `PLATFORMS` from
 * here. Do not hardcode a hex value against a platform name anywhere else.
 *
 * Assignment and why:
 *   - PlayStation → blue (`--color-accent-blue`, #4199E7). PlayStation's own
 *     brand colour is blue; the closest of the brand's four accents.
 *   - Xbox → mint (`--color-accent-mint`, #8AFBCC). Xbox's brand colour is
 *     green; mint is the only green-family accent available.
 *   - Nintendo → red (`--color-accent-red`, #EA3223). The Switch's dominant
 *     brand red.
 *   - PC → yellow (`--color-accent-yellow`, #FFFD54). No strong brand-colour
 *     convention for "PC" as a platform, so it takes the remaining accent.
 *
 * Accessibility (docs/plans/03-portal.md "Accessibility", verified against
 * the WCAG 2.1 contrast formula for background #060302):
 *
 *   colour   | as text on #060302 | black text on colour | white text on colour
 *   -------- | ------------------ | --------------------- | ---------------------
 *   red      | 4.87 (marginal AA) | 4.98 (AA)              | 4.22 (fails AA)
 *   blue     | 6.79 (AA)          | 6.94 (AA)              | 3.03 (fails AA)
 *   mint     | 16.40 (AAA)        | 16.75 (AAA)            | 1.25 (fails)
 *   yellow   | 19.02 (AAA)        | 19.43 (AAA)            | 1.08 (fails)
 *
 * Conclusion: white text on an accent fill fails AA for every one of the
 * four colours — so `PlatformBadge` below uses near-black text on the
 * accent fill, never white-on-accent. Accents are for fills/borders/icons;
 * body text stays white-on-black (20.56:1), never accent-on-black for
 * anything smaller than a large heading.
 */
export type Platform = "playstation" | "xbox" | "nintendo" | "pc";

interface PlatformMeta {
  label: string;
  colorVar: string;
  colorHex: string;
}

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  playstation: { label: "PlayStation", colorVar: "var(--color-accent-blue)", colorHex: "#4199E7" },
  xbox: { label: "Xbox", colorVar: "var(--color-accent-mint)", colorHex: "#8AFBCC" },
  nintendo: { label: "Nintendo", colorVar: "var(--color-accent-red)", colorHex: "#EA3223" },
  pc: { label: "PC", colorVar: "var(--color-accent-yellow)", colorHex: "#FFFD54" },
};

export const PLATFORM_ORDER: Platform[] = ["playstation", "xbox", "nintendo", "pc"];

/**
 * The `guessPlatform()` stand-in that used to live here (GLOBAL-PLAN M8.4's
 * scaffold placeholder) has been replaced by the real shared normalisation
 * module, `./normalize.ts`'s `normalizePlatform()` — it covers all the
 * documented raw strings (not just a substring-match subset) and returns
 * `"other"` for a recognised-but-uncategorisable value instead of silently
 * dropping it. Import from there, not from here.
 */
