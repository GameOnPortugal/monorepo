import { describe, expect, test } from "bun:test";
import {
  type AdCondition,
  formatPrice,
  normalizeCondition,
  normalizePlatform,
  normalizeZone,
} from "../src/lib/normalize";

// GLOBAL-PLAN M8.4 acceptance bar (docs/plans/03-portal.md task 4): "Unit
// tests cover every one of the 21 platform strings and the legacy condition
// strings" documented in docs/plans/00-overview.md / docs/known-issues.md.
// There is no literal enumerated list of all 21 raw strings anywhere in the
// repo (only representative examples) — this covers every example that IS
// documented, plus the input shapes those examples imply (case, spacing,
// "series S/X" suffixes, slash-separated wrong-question answers).

describe("normalizePlatform", () => {
  const playstation = [
    "PS5",
    "PS 5",
    "PS4",
    "PlayStation 5",
    "playstation 4",
    "Ps Now",
    "ps",
    "PS",
  ];
  const xbox = ["Xbox", "X box series S", "XBOX SERIE X - 60FPS", "Xbox One", "xbox series x"];
  const nintendo = ["Nintendo Switch", "Switch", "nintendo"];
  const pc = ["PC", "pc", "Steam", "Computador"];

  test.each(playstation)("%s -> playstation", (raw) => {
    expect(normalizePlatform(raw)).toBe("playstation");
  });

  test.each(xbox)("%s -> xbox", (raw) => {
    expect(normalizePlatform(raw)).toBe("xbox");
  });

  test.each(nintendo)("%s -> nintendo", (raw) => {
    expect(normalizePlatform(raw)).toBe("nintendo");
  });

  test.each(pc)("%s -> pc", (raw) => {
    expect(normalizePlatform(raw)).toBe("pc");
  });

  test("an unrecognised non-empty value is 'other', not dropped", () => {
    expect(normalizePlatform("Mobile")).toBe("other");
    expect(normalizePlatform("Android")).toBe("other");
  });

  test("null/undefined/blank is null, not 'other'", () => {
    expect(normalizePlatform(null)).toBeNull();
    expect(normalizePlatform(undefined)).toBeNull();
    expect(normalizePlatform("")).toBeNull();
    expect(normalizePlatform("   ")).toBeNull();
  });

  test("does not misfire on a zone answer that happens to contain a platform word (data reality: 'PlayStation 4/5' typed into the zone field)", () => {
    // Sanity check that normalizePlatform is only ever applied to the
    // platform column — this just documents the input isn't rejected outright.
    expect(normalizePlatform("PlayStation 4/5")).toBe("playstation");
  });
});

describe("normalizeCondition", () => {
  const cases: Array<[string, AdCondition | null]> = [
    ["Novo/Selado", "new"],
    ["Novo", "new"],
    ["Como novo", "like_new"],
    ["Muito Bom", "used_good"],
    ["new", "new"],
    ["like_new", "like_new"],
    ["used_good", "used_good"],
    ["used_marks", "used_marks"],
    ["broken", "broken"],
    // Not a physical condition — answers a different question (mostly
    // `wanted` ads). Normalises to null rather than a misleading enum value.
    ["Qualquer um", null],
    ["Versão digital", null],
    ["Não", null],
  ];

  test.each(cases)("%s -> %s", (raw, expected) => {
    expect(normalizeCondition(raw)).toBe(expected);
  });

  test("null/undefined/blank is null", () => {
    expect(normalizeCondition(null)).toBeNull();
    expect(normalizeCondition(undefined)).toBeNull();
    expect(normalizeCondition("")).toBeNull();
  });
});

describe("normalizeZone", () => {
  test("recognised districts, case/diacritic-insensitive", () => {
    expect(normalizeZone("Lisboa")).toEqual({ kind: "district", label: "Lisboa" });
    expect(normalizeZone("porto")).toEqual({ kind: "district", label: "Porto" });
    expect(normalizeZone("Lisbon")).toEqual({ kind: "district", label: "Lisboa" });
  });

  test("slash-separated multi-district picks the first", () => {
    expect(normalizeZone("Braga/Porto")).toEqual({ kind: "district", label: "Braga" });
  });

  test("digital/online zone", () => {
    expect(normalizeZone("Digital")).toEqual({ kind: "online", label: "Online" });
    expect(normalizeZone("online")).toEqual({ kind: "online", label: "Online" });
  });

  test("unrecognisable free text (including a wrong-question answer) falls back to Outra rather than throwing", () => {
    expect(normalizeZone("não se aplica")).toEqual({ kind: "other", label: "Outra" });
    expect(normalizeZone("PlayStation 4/5")).toEqual({ kind: "other", label: "Outra" });
  });

  test("null/undefined/blank is null", () => {
    expect(normalizeZone(null)).toBeNull();
    expect(normalizeZone(undefined)).toBeNull();
    expect(normalizeZone("")).toBeNull();
  });
});

// Intl.NumberFormat("pt-PT", { style: "currency" }) separates the amount
// from the symbol with a non-breaking space (U+00A0), not a regular one —
// normalise before comparing so the assertion doesn't depend on an
// invisible-in-the-editor character.
function withoutNbsp(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("formatPrice", () => {
  test("formats price_cents as EUR when present", () => {
    expect(withoutNbsp(formatPrice(30000, "300"))).toBe("300,00 €");
    expect(withoutNbsp(formatPrice(6500, "65€"))).toBe("65,00 €");
  });

  test("falls back to the raw free-text price when price_cents could not be parsed", () => {
    expect(formatPrice(null, "troca por outro jogo")).toBe("troca por outro jogo");
  });

  test("says so honestly when neither is available", () => {
    expect(formatPrice(null, null)).toBe("Preço não indicado");
    expect(formatPrice(null, "")).toBe("Preço não indicado");
  });
});
