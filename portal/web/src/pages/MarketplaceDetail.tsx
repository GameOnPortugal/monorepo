import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdCard } from "../components/AdCard";
import { LazyImage } from "../components/LazyImage";
import { Lightbox } from "../components/Lightbox";
import { PlatformBadge } from "../components/PlatformBadge";
import { SkeletonRow } from "../components/StateViews";
import { api, thumbnailUrl } from "../lib/api/client";
import {
  CONDITION_LABELS,
  formatPrice,
  normalizeCondition,
  normalizePlatform,
  normalizeZone,
} from "../lib/normalize";
import { PLATFORMS } from "../lib/platforms";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

const DISPATCH_LABELS: Record<string, string> = {
  included: "Envio incluído",
  not_included: "Envio não incluído",
  face_to_face: "Entrega em mão",
};

const DATE_FORMAT = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" });

/**
 * M8.7 + M11 — ad detail.
 *
 * `getAdById` 404s for a soft-deleted/inactive row (`publicAdsWhere`). A 404
 * and a network/5xx both surface as one honest "not available" state: neither
 * is actionable differently by a visitor, since both times the ad cannot be
 * shown.
 *
 * "Contact on Discord" is a plain invite link, not a deep link to the ad's
 * own message: portal-api deliberately never returns `channel_id`/
 * `message_id` (privacy decision 5 groups them with raw user IDs), so this
 * page has no message reference to link to even if it wanted one.
 *
 * M11 adds the full spec table — the ad's `zone`, `dispatch`, `warranty` and
 * dates were all being fetched and then thrown away, so a listing showed a
 * photo and a price and left every practical question ("does it ship?", "how
 * old is this?") unanswered.
 */
export function MarketplaceDetail() {
  const { id } = useParams<{ id: string }>();
  const { state, data } = useApi(() => api.getAd(id!), [id], () => false);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const ad = data?.ad;

  useDocumentHead({
    title: ad?.name ?? "Anúncio",
    description: ad?.description ?? undefined,
    image: ad?.images[0],
    path: id ? `/marketplace/${id}` : undefined,
  });

  const lightboxItems = useMemo(
    () => (ad?.images ?? []).map((image, index) => ({ id: `${index}`, name: ad?.name ?? null, imageUrl: image })),
    [ad],
  );

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <SkeletonRow tiles={1} className="aspect-video w-full" />
      </div>
    );
  }

  if (state === "error" || !ad) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold uppercase">Anúncio não disponível</h1>
        <p className="mt-3 text-white/60">Pode ter sido vendido, removido, ou o link estar incorreto.</p>
        <Link
          to="/marketplace"
          className="focus-glow chamfer mt-8 inline-block bg-accent-yellow px-6 py-3 font-bold text-background"
        >
          Voltar ao mercado
        </Link>
      </div>
    );
  }

  const condition = normalizeCondition(ad.state);
  // Same one-column rule as AdCard: a value that parsed as a condition is not
  // also a platform, and "other" asserts nothing worth showing.
  const platform = condition === null ? normalizePlatform(ad.state) : null;
  const knownPlatform = platform && platform !== "other" ? platform : null;
  const zone = normalizeZone(ad.zone);
  const dispatch = ad.dispatch ? (DISPATCH_LABELS[ad.dispatch] ?? ad.dispatch) : null;
  const accent = knownPlatform ? PLATFORMS[knownPlatform].colorVar : "var(--color-surface-border)";
  const images = ad.images.length > 0 ? ad.images : [null];

  const specs: Array<{ label: string; value: string }> = [
    { label: "Tipo", value: ad.adType === "wanted" ? "Procura-se" : "À venda" },
    ...(condition ? [{ label: "Estado", value: CONDITION_LABELS[condition] }] : []),
    ...(zone ? [{ label: "Zona", value: zone.label }] : []),
    ...(dispatch ? [{ label: "Envio", value: dispatch }] : []),
    ...(ad.warranty ? [{ label: "Garantia", value: ad.warranty }] : []),
    { label: "Publicado", value: DATE_FORMAT.format(new Date(ad.createdAt)) },
    ...(ad.bumped_at ? [{ label: "Renovado", value: DATE_FORMAT.format(new Date(ad.bumped_at)) }] : []),
    ...(ad.expires_at ? [{ label: "Expira", value: DATE_FORMAT.format(new Date(ad.expires_at)) }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link
        to="/marketplace"
        className="focus-glow rounded font-mono text-xs text-white/45 transition-colors hover:text-white"
      >
        ← Mercado
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface">
            <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ backgroundColor: accent }} />
            <LazyImage
              src={images[activeImage] ?? null}
              alt={ad.name ?? "Anúncio"}
              className="aspect-video w-full"
              onClick={ad.images.length > 0 ? () => setLightboxOpen(true) : undefined}
            />
          </div>

          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={image ?? index}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Imagem ${index + 1}`}
                  aria-current={index === activeImage}
                  className={`focus-glow h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                    index === activeImage ? "border-accent-yellow" : "border-surface-border hover:border-white/30"
                  }`}
                >
                  <LazyImage src={thumbnailUrl(image, 160)} alt="" className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {knownPlatform && <PlatformBadge platform={knownPlatform} size="md" />}
            {ad.adType === "wanted" && (
              <span className="rounded-md border border-accent-blue px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.12em] text-accent-blue uppercase">
                Procura-se
              </span>
            )}
          </div>

          <h1 className="mt-4 font-display text-4xl leading-none font-extrabold uppercase">
            {ad.name ?? "Anúncio sem título"}
          </h1>

          <p className="tabular mt-4 font-display text-5xl leading-none font-extrabold text-accent-yellow">
            {formatPrice(ad.price_cents, ad.price)}
          </p>

          <dl className="mt-8 divide-y divide-surface-border border-y border-surface-border">
            {specs.map((spec) => (
              <div key={spec.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="font-mono text-[10px] tracking-[0.15em] text-white/40 uppercase">{spec.label}</dt>
                <dd className="text-right text-sm">{spec.value}</dd>
              </div>
            ))}
          </dl>

          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            className="focus-glow chamfer mt-8 block bg-accent-yellow px-6 py-3.5 text-center font-bold text-background transition-transform hover:-translate-y-0.5"
          >
            Contactar no Discord
          </a>
          <p className="mt-3 text-center font-mono text-[11px] text-white/35">
            O negócio faz-se no servidor — este site não trata pagamentos.
          </p>
        </div>
      </div>

      {ad.description && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold uppercase">Descrição</h2>
          <p className="mt-4 max-w-3xl leading-relaxed whitespace-pre-wrap text-white/75">{ad.description}</p>
        </section>
      )}

      <RelatedAds currentId={ad.id} adType={ad.adType} />

      {lightboxOpen && (
        <Lightbox
          items={lightboxItems}
          index={activeImage}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setActiveImage}
        />
      )}
    </div>
  );
}

/**
 * "Other listings like this one" — same ad type, newest first, the current ad
 * excluded. Not a similarity model: there is no category on an `Ad` to match
 * on, so pretending to recommend would be dressing up "here are some others"
 * as something cleverer than it is. The heading says exactly what it is.
 */
function RelatedAds({ currentId, adType }: { currentId: string; adType: string | null }) {
  const { state, data } = useApi(() => api.listAds(24), [], () => false);

  if (state !== "ready" || !data) return null;

  const related = data.ads.filter((ad) => ad.id !== currentId && ad.adType === adType).slice(0, 3);
  if (related.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="border-b border-surface-border pb-4 font-display text-2xl font-extrabold uppercase">
        Outros anúncios
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {related.map((ad) => (
          <AdCard key={ad.id} ad={ad} />
        ))}
      </div>
    </section>
  );
}
