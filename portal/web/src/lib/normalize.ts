/**
 * GLOBAL-PLAN M8.4 — the shared normalisation module: 21 stored platform
 * strings → 4 canonical platforms + Other, legacy Portuguese free-text
 * conditions → the bot's condition enum, free-text zone → district (or
 * Online/Outra), and price display from `price_cents`.
 *
 * **Scope note** (see the M8.4 row in docs/plans/GLOBAL-PLAN.md for the
 * full reasoning): plan 03 wants this module shared by the bot *and* the
 * portal. It is implemented **portal-side only** here — another agent was
 * working in `discord-bot/` concurrently with this one, so touching bot
 * source/schema was off-limits. Bot-side adoption (importing the same
 * mapping rules, or extracting this into a workspace package the bot also
 * depends on) is recorded as follow-up, not done.
 *
 * **Map at display time; never rewrite history** (plan 03's data
 * normalisation section) — nothing here writes to the database. Every
 * function is a pure `string | null -> X` mapper over whatever the API
 * returned as-is.
 *
 * Platform colour mapping stays exactly where M8.5 put it, `./platforms.ts`
 * — this module normalises *strings* to a `Platform` key; it does not
 * define or duplicate the colour assignment.
 */
import { type Platform, PLATFORM_ORDER } from "./platforms";

// ---------------------------------------------------------------------------
// Platform: 21 stored strings (docs/plans/00-overview.md "Data reality") -> 4
// canonical platforms + "other".
// ---------------------------------------------------------------------------

/** `Platform` (one of the 4 brand-accent platforms) plus the residual bucket. */
export type PlatformTag = Platform | "other";

// Keyword tests, ordered so a more specific match (e.g. "nintendo switch")
// never gets shadowed by a looser one. Lower-cased, accent-insensitive input
// is tested against each; first match wins.
const PLATFORM_KEYWORDS: Array<{ platform: Platform; test: RegExp }> = [
  // PlayStation: "ps5", "ps4", "ps 5", "playstation 5", "ps now", bare "ps".
  { platform: "playstation", test: /\bplaystation\b|\bps\s?\d\b|\bps\s?now\b|\bps\d?\/\d\b|^ps$/ },
  // Xbox: "xbox", "x box", "xbox series x/s", "xbox one".
  { platform: "xbox", test: /\bx[\s-]?box\b/ },
  // Nintendo: "switch", "nintendo".
  { platform: "nintendo", test: /\bnintendo\b|\bswitch\b/ },
  // PC: "pc", "steam", "computador", "windows".
  { platform: "pc", test: /\bpc\b|\bsteam\b|\bcomputador\b|\bwindows\b/ },
];

/**
 * Best-effort normalisation of one of the ~21 raw `screenshots.plataform` /
 * `ads.state`-as-platform strings into a canonical `Platform`, or `"other"`
 * for a non-empty value that matches none of the four (e.g. "Mobile",
 * "Android", "não se aplica" used as a platform answer), or `null` for
 * missing/blank input.
 *
 * Covers every example documented in 00-overview.md/known-issues.md:
 * `PS5`, `PlayStation 5`, `PS 5`, `PS`, `Ps Now`, `PS4`, `PlayStation 4/5`,
 * `X box series S`, `XBOX SERIE X - 60FPS`, `Xbox One`, `Nintendo Switch`,
 * `Switch`, `PC`, `Steam`.
 */
export function normalizePlatform(raw: string | null | undefined): PlatformTag | null {
  if (!raw) return null;
  const value = stripDiacritics(raw.toLowerCase().trim());
  if (value === "") return null;

  for (const { platform, test } of PLATFORM_KEYWORDS) {
    if (test.test(value)) return platform;
  }

  return "other";
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export { PLATFORM_ORDER };

// ---------------------------------------------------------------------------
// Condition: legacy Portuguese free text -> the bot's condition enum
// (discord-bot/src/Domain/Marketplace/AdListingRenderer.ts's STATE_LABELS:
// new | like_new | used_good | used_marks | broken).
// ---------------------------------------------------------------------------

export type AdCondition = "new" | "like_new" | "used_good" | "used_marks" | "broken";

export const CONDITION_LABELS: Record<AdCondition, string> = {
  new: "Novo",
  like_new: "Como novo",
  used_good: "Usado - Bom estado",
  used_marks: "Usado - Com marcas",
  broken: "Avariado",
};

// Legacy free-text values seen in production (docs/plans/00-overview.md
// "Data reality": `Novo/Selado`, `Como novo`, `Muito Bom`, `Qualquer um`,
// `Versão digital`, `Não`), folded onto the enum. Matched case/diacritic
// -insensitively against the whole trimmed string first (exact legacy
// phrases), then substring, so near-variants still resolve.
const CONDITION_EXACT: Record<string, AdCondition> = {
  "novo/selado": "new",
  novo: "new",
  "como novo": "like_new",
  "muito bom": "used_good",
};

// Enum values already stored as-is (roughly a quarter of rows per
// 00-overview.md) pass straight through.
const CONDITION_ENUM_VALUES = new Set<string>(["new", "like_new", "used_good", "used_marks", "broken"]);

/**
 * `"Qualquer um"` ("any condition") and `"Versão digital"` ("digital
 * version") aren't a physical condition at all — they answer a different
 * question (mostly seen on `wanted` ads, where condition doesn't apply).
 * `"Não"` is a literal "no" to whatever the old bot's form asked. All three
 * normalise to `null` ("no condition to display") rather than being forced
 * into an enum value that would misrepresent the listing.
 */
export function normalizeCondition(raw: string | null | undefined): AdCondition | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (CONDITION_ENUM_VALUES.has(trimmed)) return trimmed as AdCondition;

  const value = stripDiacritics(trimmed.toLowerCase());
  if (value in CONDITION_EXACT) return CONDITION_EXACT[value];

  return null;
}

// ---------------------------------------------------------------------------
// Zone: free text -> Portuguese district (or Online / Outra).
// ---------------------------------------------------------------------------

/** The 18 mainland districts plus the two autonomous regions. */
const DISTRICTS = [
  "Aveiro",
  "Beja",
  "Braga",
  "Bragança",
  "Castelo Branco",
  "Coimbra",
  "Évora",
  "Faro",
  "Guarda",
  "Leiria",
  "Lisboa",
  "Portalegre",
  "Porto",
  "Santarém",
  "Setúbal",
  "Viana do Castelo",
  "Vila Real",
  "Viseu",
  "Açores",
  "Madeira",
] as const;

export type District = (typeof DISTRICTS)[number];

export interface NormalizedZone {
  kind: "district" | "online" | "other";
  /** Display label — a canonical district name, "Online" or "Outra". */
  label: string;
}

const DISTRICT_BY_KEY = new Map<string, District>(
  DISTRICTS.map((district) => [stripDiacritics(district.toLowerCase()), district]),
);
// A couple of common English/alt spellings seen in the data (00-overview.md:
// `porto`, `Lisbon`) that don't match a plain diacritic-strip of the
// Portuguese name.
DISTRICT_BY_KEY.set("lisbon", "Lisboa");

const ONLINE_KEYWORDS = /\bdigital\b|\bonline\b|\bpc\b|internet/;

/**
 * `zone` is free text with no enforced vocabulary (00-overview.md: `Lisboa`,
 * `porto`, `Lisbon`, `Braga/Porto`, `Digital`, `não se aplica`, and even
 * `PlayStation 4/5` — someone answered the wrong question). This picks the
 * **first** recognisable district out of a `/`- or `,`-separated list
 * (`Braga/Porto` -> Braga) rather than trying to represent multi-district
 * listings, matches "Digital"/"Online" to a dedicated `online` bucket (an
 * increasing share of listings are digital-only, per plan 01), and falls
 * back to `other` ("Outra") for anything else — including nonsense answers
 * like a platform name typed into the zone field, which is not this
 * function's job to detect/fix, only to not crash on.
 */
export function normalizeZone(raw: string | null | undefined): NormalizedZone | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const lowered = stripDiacritics(trimmed.toLowerCase());
  if (ONLINE_KEYWORDS.test(lowered)) {
    return { kind: "online", label: "Online" };
  }

  const firstToken = lowered.split(/[/,]/)[0]?.trim() ?? lowered;
  const district = DISTRICT_BY_KEY.get(firstToken) ?? DISTRICT_BY_KEY.get(lowered);
  if (district) {
    return { kind: "district", label: district };
  }

  return { kind: "other", label: "Outra" };
}

// ---------------------------------------------------------------------------
// Price: price_cents (already parsed bot-side by the M5.3 migration) ->
// display string, falling back to the original free-text `price` when
// price_cents could not be parsed.
// ---------------------------------------------------------------------------

const PRICE_FORMATTER = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/**
 * `price_cents` is NULL for rows the bot's M5.3 migration could not parse
 * unambiguously (never for "free", per the schema's own comment) — fall back
 * to showing the original free-text `price` the seller typed, and only when
 * *that* is also missing say so explicitly rather than rendering blank.
 */
export function formatPrice(priceCents: number | null | undefined, rawPrice: string | null | undefined): string {
  if (typeof priceCents === "number" && Number.isFinite(priceCents)) {
    return PRICE_FORMATTER.format(priceCents / 100);
  }
  if (rawPrice && rawPrice.trim() !== "") {
    return rawPrice.trim();
  }
  return "Preço não indicado";
}
