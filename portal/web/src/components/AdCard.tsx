import { Link } from "react-router-dom";
import type { Ad } from "../lib/api/client";
import { formatPrice, normalizeCondition, normalizePlatform, CONDITION_LABELS } from "../lib/normalize";
import { LazyImage } from "./LazyImage";
import { PlatformBadge } from "./PlatformBadge";

/**
 * One marketplace listing card — used by both the Home "newest listings"
 * strip (M8.6) and the Marketplace grid (M8.7), so the two never drift.
 *
 * `ad.state` is overloaded in the schema (docs/00-overview.md "Data
 * reality": it means *condition*, not platform) — this card runs it through
 * BOTH `normalizeCondition` and `normalizePlatform`. Neither is guaranteed
 * to match; each renders only if it does. That is a display nicety, not a
 * bug: a handful of ads have platform-shaped text in a condition-shaped
 * column ("Data reality": someone answered the wrong question).
 */
export function AdCard({ ad }: { ad: Ad }) {
  const condition = normalizeCondition(ad.state);
  const platform = normalizePlatform(ad.state);

  return (
    <Link
      to={`/marketplace/${ad.id}`}
      className="chamfer group block border border-surface-border bg-surface transition-colors hover:border-white/30"
    >
      <LazyImage
        src={ad.images[0] ?? null}
        alt={ad.name ?? "Anúncio"}
        className="aspect-video w-full overflow-hidden border-b border-surface-border"
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold group-hover:text-accent-yellow">{ad.name ?? "Anúncio sem título"}</h3>
          {ad.adType === "wanted" && (
            <span className="chamfer shrink-0 border border-accent-blue px-2 py-0.5 text-[11px] font-semibold text-accent-blue">
              PROCURA-SE
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/70">{formatPrice(ad.price_cents, ad.price)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {platform && <PlatformBadge platform={platform} />}
          {condition && (
            <span className="chamfer inline-flex items-center border border-surface-border px-2 py-0.5 text-xs text-white/70">
              {CONDITION_LABELS[condition]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
