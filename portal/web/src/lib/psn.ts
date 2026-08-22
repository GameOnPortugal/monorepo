/**
 * Reading a game out of a stored PSNProfiles trophy URL.
 *
 * There is no game column anywhere in the schema — `trophies` holds only
 * `url`, `points` and `completionDate` (discord-bot/prisma/schema.prisma).
 * But the URL the bot captured when it claimed the trophy
 * (`PsnProfilesTrophySource.parseProfileTrophies`) carries the game in its
 * path:
 *
 *     https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Someone
 *                                      └── id ──┘└──── slug ────────┘
 *
 * so "which games has this hunter platinumed" is answerable from data already
 * in the database, with no new scraping and no new column. That is the whole
 * reason the hunter page can show a game list at all.
 *
 * Deliberately conservative: anything that does not match the expected shape
 * returns `null` and the caller shows the trophy without a game name, rather
 * than this inventing a title from a URL it did not understand. The slug is a
 * lossy, lower-cased, punctuation-stripped form of the real title — see
 * `titleFromSlug` for exactly how far it is safe to un-mangle it.
 */

/** A game as recovered from a trophy URL. `id` is PSNProfiles' own numeric id. */
export interface TrophyGame {
  id: string;
  slug: string;
  title: string;
  /** The game's trophy page — the URL minus the profile segment. */
  url: string;
}

const TROPHY_PATH = /\/trophies\/(\d+)-([a-z0-9-]+)/i;

/**
 * Words the slug lower-cases that should not be title-cased back, so
 * "marvels-spider-man-miles-morales" reads "Marvels Spider Man Miles Morales"
 * but "grand-theft-auto-iv" keeps its numeral as "IV" rather than "Iv".
 */
const ROMAN_NUMERAL = /^(?:i{1,3}|i[vx]|vi{0,3}|ix|xi{0,3}|xiv|xv|xvi{0,3}|xix|xx)$/;
const LOWERCASE_WORDS = new Set(["a", "an", "and", "of", "the", "to", "in", "on", "at", "for", "vs"]);

function titleFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);

  return words
    .map((word, index) => {
      if (ROMAN_NUMERAL.test(word)) return word.toUpperCase();
      // Small words stay lower-cased mid-title, but never as the first word.
      if (index > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function gameFromTrophyUrl(url: string | null | undefined): TrophyGame | null {
  if (!url) return null;

  const match = TROPHY_PATH.exec(url);
  if (!match) return null;

  const [, id, slug] = match;
  if (!id || !slug) return null;

  return {
    id,
    slug,
    title: titleFromSlug(slug),
    url: `https://psnprofiles.com/trophies/${id}-${slug}`,
  };
}

/** A hunter's PSNProfiles page. The column is un-validated free text, hence the encode. */
export function psnProfileUrl(psnProfile: string): string {
  return `https://psnprofiles.com/${encodeURIComponent(psnProfile)}`;
}

/**
 * Deterministic accent for a hunter's monogram tile.
 *
 * **Not** a platform colour, despite drawing from the same four values: every
 * profile on this leaderboard is a PSN profile, so colouring by platform
 * would paint the whole page one blue. This is identity-by-hash — the same
 * name always gets the same tile, which makes a hunter recognisable when
 * scanning a list, and it is the honest stand-in until a real avatar exists
 * (`trophyprofiles` stores no avatar; see docs/plans/GLOBAL-PLAN.md).
 */
const MONOGRAM_COLORS = [
  "var(--color-accent-blue)",
  "var(--color-accent-mint)",
  "var(--color-accent-yellow)",
  "var(--color-accent-red)",
];

export function monogramColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length]!;
}

export function monogram(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}
