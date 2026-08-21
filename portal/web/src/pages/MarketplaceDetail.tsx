import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LazyImage } from "../components/LazyImage";
import { PlatformBadge } from "../components/PlatformBadge";
import { SkeletonRow } from "../components/StateViews";
import { api } from "../lib/api/client";
import {
  CONDITION_LABELS,
  formatPrice,
  normalizeCondition,
  normalizePlatform,
  normalizeZone,
} from "../lib/normalize";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

const DISPATCH_LABELS: Record<string, string> = {
  included: "Envio incluído",
  not_included: "Envio não incluído",
  face_to_face: "Entrega em mão",
};

/**
 * M8.7 — ad detail view. `getAdById` 404s for a soft-deleted/inactive row
 * (portal/api/src/repositories/ads.ts's `publicAdsWhere`). A 404 and a
 * network/5xx failure both surface here as one honest "not available"
 * state rather than a blank page — the two aren't disambiguated because
 * neither is actionable differently by a visitor (both times, the ad
 * cannot currently be shown).
 *
 * "Contact on Discord" (plan 03's pages table) is a plain invite link, not a
 * deep link to the ad's own message: `portal/api`'s ads repository
 * deliberately never returns `channel_id`/`message_id` (privacy decision 5
 * groups them with raw user IDs — see that file's header comment), so this
 * page has no message reference to link to even if it wanted to. Recorded
 * as a scope decision in the M8.7 row, not an oversight.
 */
export function MarketplaceDetail() {
  const { id } = useParams<{ id: string }>();
  const { state, data } = useApi(
    () => api.getAd(id!),
    [id],
    () => false,
  );
  const [activeImage, setActiveImage] = useState(0);

  // Called unconditionally (Rules of Hooks) — before the loading/error early
  // returns below, so it runs on every render regardless of fetch state.
  // Falls back to the site defaults (index.html) while data isn't loaded
  // yet, then swaps in the ad's own name/first image once it is.
  useDocumentHead({
    title: data?.ad?.name ?? "Anúncio",
    description: data?.ad?.description ?? undefined,
    image: data?.ad?.images[0],
    path: id ? `/marketplace/${id}` : undefined,
  });

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <SkeletonRow tiles={1} className="aspect-video w-full" />
      </div>
    );
  }

  const ad = data?.ad;

  if (state === "error" || !ad) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl">Anúncio não disponível</h1>
        <p className="mt-2 text-white/60">Pode ter sido vendido, removido, ou o link estar incorreto.</p>
        <Link to="/marketplace" className="focus-glow mt-6 inline-block text-accent-blue hover:underline">
          ← Voltar ao marketplace
        </Link>
      </div>
    );
  }

  const condition = normalizeCondition(ad.state);
  const platform = normalizePlatform(ad.state);
  const zone = normalizeZone(ad.zone);
  const dispatch = ad.dispatch ? (DISPATCH_LABELS[ad.dispatch] ?? ad.dispatch) : null;
  const images = ad.images.length > 0 ? ad.images : [null];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/marketplace" className="focus-glow text-sm text-white/60 hover:text-white">
        ← Marketplace
      </Link>

      <div className="mt-4 chamfer overflow-hidden border border-surface-border bg-surface">
        <LazyImage src={images[activeImage] ?? null} alt={ad.name ?? "Anúncio"} className="aspect-video w-full" />
      </div>

      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img ?? i}
              type="button"
              onClick={() => setActiveImage(i)}
              className={`focus-glow chamfer h-14 w-20 shrink-0 overflow-hidden border ${
                i === activeImage ? "border-accent-yellow" : "border-surface-border"
              }`}
            >
              <LazyImage src={img} alt="" className="h-full w-full" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl">{ad.name ?? "Anúncio sem título"}</h1>
        {ad.adType === "wanted" && (
          <span className="chamfer shrink-0 border border-accent-blue px-2 py-1 text-xs font-semibold text-accent-blue">
            PROCURA-SE
          </span>
        )}
      </div>
      <p className="mt-1 text-xl text-accent-yellow">{formatPrice(ad.price_cents, ad.price)}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {platform && <PlatformBadge platform={platform} />}
        {condition && (
          <span className="chamfer border border-surface-border px-2 py-0.5 text-xs text-white/70">
            {CONDITION_LABELS[condition]}
          </span>
        )}
        {zone && (
          <span className="chamfer border border-surface-border px-2 py-0.5 text-xs text-white/70">
            {zone.label}
          </span>
        )}
        {dispatch && (
          <span className="chamfer border border-surface-border px-2 py-0.5 text-xs text-white/70">{dispatch}</span>
        )}
      </div>

      {ad.description && <p className="mt-4 whitespace-pre-wrap text-white/80">{ad.description}</p>}

      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer"
        className="focus-glow chamfer mt-8 inline-block bg-accent-blue px-6 py-3 font-semibold text-background transition-opacity hover:opacity-90"
      >
        Contactar no Discord
      </a>
    </div>
  );
}
