import { Link } from "react-router-dom";
import type { Ad } from "../lib/api/client";
import { thumbnailUrl } from "../lib/api/client";
import { CONDITION_LABELS, formatPrice, normalizeCondition, normalizePlatform, normalizeZone } from "../lib/normalize";
import { PLATFORMS } from "../lib/platforms";
import { LazyImage } from "./LazyImage";
import { PlatformBadge } from "./PlatformBadge";

/**
 * One marketplace listing card — used by the Home preview (M8.6), the
 * Marketplace grid (M8.7) and the "related" strip on a detail page, so the
 * three never drift.
 *
 * `ad.state` is overloaded in the schema (docs/00-overview.md "Data reality":
 * it means *condition*, not platform) — this card runs it through BOTH
 * `normalizeCondition` and `normalizePlatform`. Neither is guaranteed to
 * match; each renders only if it does. That is a display nicety, not a bug: a
 * handful of ads have platform-shaped text in a condition-shaped column.
 *
 * M11: the platform's accent became the card's top rule, which is what makes
 * a grid of listings scannable by platform at a glance rather than needing
 * every badge read. `other`/unknown gets a neutral rule — the four accents
 * mean something specific (src/lib/platforms.ts) and a fifth invented colour
 * would dilute that.
 */
export function AdCard({ ad }: { ad: Ad }) {
  const condition = normalizeCondition(ad.state);
  // `state` is a single overloaded column (docs/00-overview.md "Data
  // reality"). If it parsed as a *condition*, it is definitionally not also a
  // platform — reading it as both is how a "Novo/Selado" ad ended up wearing
  // an "Outra" platform badge, asserting a platform nobody recorded. And an
  // unrecognised value carries no information worth a badge either way.
  const platform = condition === null ? normalizePlatform(ad.state) : null;
  const knownPlatform = platform && platform !== "other" ? platform : null;
  const zone = normalizeZone(ad.zone);
  const accent = knownPlatform ? PLATFORMS[knownPlatform].colorVar : "var(--color-surface-border)";

  return (
    <Link
      to={`/marketplace/${ad.id}`}
      className="focus-glow group relative flex h-full flex-col overflow-hidden rounded-xl border border-surface-border bg-surface transition-all duration-200 hover:-translate-y-1.5 hover:border-white/25"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ backgroundColor: accent }} />

      <div className="relative overflow-hidden">
        <LazyImage
          src={thumbnailUrl(ad.images[0] ?? null, 480)}
          alt={ad.name ?? "Anúncio"}
          className="aspect-video w-full overflow-hidden border-b border-surface-border transition-transform duration-500 group-hover:scale-[1.06]"
        />
        {ad.adType === "wanted" && (
          <span className="absolute top-3 right-3 rounded-md border border-accent-blue bg-background/85 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-accent-blue uppercase backdrop-blur">
            Procura-se
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold transition-colors group-hover:text-accent-yellow">
          {ad.name ?? "Anúncio sem título"}
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {knownPlatform && <PlatformBadge platform={knownPlatform} />}
          {condition && (
            <span className="rounded-md border border-surface-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-white/60">
              {CONDITION_LABELS[condition]}
            </span>
          )}
          {zone && (
            <span className="rounded-md border border-surface-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-white/60">
              {zone.label}
            </span>
          )}
        </div>

        <p className="tabular mt-auto pt-4 font-display text-3xl leading-none font-extrabold">
          {formatPrice(ad.price_cents, ad.price)}
        </p>
      </div>
    </Link>
  );
}
