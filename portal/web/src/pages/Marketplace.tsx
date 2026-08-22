import { useMemo, useState } from "react";
import { AdCard } from "../components/AdCard";
import { HelpLink, PageHeader } from "../components/PageHeader";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { ActiveFilters, SearchField, SegmentedControl, SelectField, Toggle } from "../components/ui/Controls";
import { api } from "../lib/api/client";
import {
  type AdCondition,
  CONDITION_LABELS,
  normalizeCondition,
  normalizePlatform,
  normalizeZone,
  type PlatformTag,
} from "../lib/normalize";
import { PLATFORM_ORDER, PLATFORMS } from "../lib/platforms";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

type AdTypeFilter = "all" | "sell" | "wanted";
type SortOrder = "recent" | "price_asc" | "price_desc";
type ZoneFilter = "all" | string;

const PAGE_SIZE = 24;

const PLATFORM_LABEL: Record<PlatformTag, string> = {
  playstation: PLATFORMS.playstation.label,
  xbox: PLATFORMS.xbox.label,
  nintendo: PLATFORMS.nintendo.label,
  pc: PLATFORMS.pc.label,
  other: "Outra",
};

/**
 * M8.7 + M11 — the marketplace.
 *
 * All filtering happens client-side over one fetch of the active set (~40
 * rows today). That is deliberate: the platform/condition/zone filters run on
 * *normalised* values, and M8.4's mapping lives in `portal/web` only — so
 * filtering server-side would mean duplicating it in the API, and filtering a
 * server-paginated page would show fewer results than the count promises. If
 * the active set grows by an order of magnitude this moves server-side; noted
 * as a scaling follow-up, not a correctness gap today.
 *
 * M11 adds free-text search, per-option result counts, a photo-only toggle, a
 * removable summary of what is currently filtering, and paging — so a visitor
 * can actually find "a PS5 game under 40€ near Porto" instead of scrolling
 * every listing.
 */
export function Marketplace() {
  useDocumentHead({
    title: "Mercado",
    description: "Anúncios de compra e venda entre membros da comunidade Game On Portugal.",
    path: "/marketplace",
  });

  const { state, data } = useApi(
    () => api.listAds(200),
    [],
    (value) => value.ads.length === 0,
  );

  const [query, setQuery] = useState("");
  const [adType, setAdType] = useState<AdTypeFilter>("all");
  const [platform, setPlatform] = useState<PlatformTag | "all">("all");
  const [condition, setCondition] = useState<AdCondition | "all">("all");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [withPhoto, setWithPhoto] = useState(false);
  const [sort, setSort] = useState<SortOrder>("recent");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const ads = useMemo(() => data?.ads ?? [], [data]);

  // Option counts come from the whole loaded set, not the filtered one, so a
  // dropdown never offers "PC (0)" or silently hides a platform that exists.
  const counts = useMemo(() => {
    const platforms = new Map<PlatformTag, number>();
    const conditions = new Map<AdCondition, number>();
    const zones = new Map<string, number>();

    for (const ad of ads) {
      const c = normalizeCondition(ad.state);
      if (c) conditions.set(c, (conditions.get(c) ?? 0) + 1);
      // Counted exactly the way AdCard reads it, or the dropdown would promise
      // "PC (3)" and the grid would show three cards with no PC badge.
      const p = c === null ? normalizePlatform(ad.state) : null;
      if (p) platforms.set(p, (platforms.get(p) ?? 0) + 1);
      const z = normalizeZone(ad.zone);
      if (z) zones.set(z.label, (zones.get(z.label) ?? 0) + 1);
    }
    return { platforms, conditions, zones };
  }, [ads]);

  const zoneOptions = useMemo(
    () =>
      Array.from(counts.zones.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "pt-PT"))
        .map(([label, count]) => ({ value: label, label, count })),
    [counts],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let result = ads;

    if (term) {
      result = result.filter(
        (ad) =>
          (ad.name ?? "").toLowerCase().includes(term) || (ad.description ?? "").toLowerCase().includes(term),
      );
    }
    if (adType !== "all") result = result.filter((ad) => ad.adType === adType);
    if (platform !== "all")
      result = result.filter((ad) => normalizeCondition(ad.state) === null && normalizePlatform(ad.state) === platform);
    if (condition !== "all") result = result.filter((ad) => normalizeCondition(ad.state) === condition);
    if (zone !== "all") result = result.filter((ad) => normalizeZone(ad.zone)?.label === zone);
    if (withPhoto) result = result.filter((ad) => ad.images.length > 0);

    if (sort === "price_asc" || sort === "price_desc") {
      // Ads with no parseable price are not "free" (schema note on
      // `price_cents`) — they sort to the end either way rather than being
      // treated as 0€ and hijacking the cheapest slot.
      const priced = result.filter((ad) => ad.price_cents != null);
      const unpriced = result.filter((ad) => ad.price_cents == null);
      priced.sort((a, b) =>
        sort === "price_asc" ? a.price_cents! - b.price_cents! : b.price_cents! - a.price_cents!,
      );
      result = [...priced, ...unpriced];
    }

    return result;
    // `zone` and `withPhoto` were missing from this list before M11, so
    // changing the zone dropdown filtered nothing until some other filter
    // happened to invalidate the memo.
  }, [ads, query, adType, platform, condition, zone, withPhoto, sort]);

  const chips = [
    query.trim() && { key: "q", label: `“${query.trim()}”`, onRemove: () => setQuery("") },
    adType !== "all" && {
      key: "type",
      label: adType === "sell" ? "À venda" : "Procura-se",
      onRemove: () => setAdType("all"),
    },
    platform !== "all" && {
      key: "platform",
      label: PLATFORM_LABEL[platform],
      onRemove: () => setPlatform("all"),
    },
    condition !== "all" && {
      key: "condition",
      label: CONDITION_LABELS[condition],
      onRemove: () => setCondition("all"),
    },
    zone !== "all" && { key: "zone", label: zone, onRemove: () => setZone("all") },
    withPhoto && { key: "photo", label: "Com foto", onRemove: () => setWithPhoto(false) },
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  function clearAll() {
    setQuery("");
    setAdType("all");
    setPlatform("all");
    setCondition("all");
    setZone("all");
    setWithPhoto(false);
    setVisible(PAGE_SIZE);
  }

  const forSale = ads.filter((ad) => ad.adType !== "wanted").length;
  const wanted = ads.filter((ad) => ad.adType === "wanted").length;

  return (
    <div>
      <PageHeader
        eyebrow="Compra, vende, troca"
        title="Mercado"
        description="Anúncios entre membros da comunidade. Os negócios fazem-se no Discord — isto é a montra."
        stats={[
          { label: "À venda", value: forSale.toLocaleString("pt-PT"), accent: "var(--color-accent-mint)" },
          { label: "Procura-se", value: wanted.toLocaleString("pt-PT"), accent: "var(--color-accent-blue)" },
        ]}
      >
        <HelpLink to="/como-participar#marketplace">Como publicar um anúncio</HelpLink>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            value={query}
            onChange={(next) => {
              setQuery(next);
              setVisible(PAGE_SIZE);
            }}
            label="Procurar anúncios"
            placeholder="Procurar por título ou descrição…"
          />

          <SegmentedControl<AdTypeFilter>
            label="Tipo de anúncio"
            value={adType}
            onChange={(next) => {
              setAdType(next);
              setVisible(PAGE_SIZE);
            }}
            options={[
              { value: "all", label: "Todos" },
              { value: "sell", label: "À venda", accent: "var(--color-accent-mint)" },
              { value: "wanted", label: "Procura-se", accent: "var(--color-accent-blue)" },
            ]}
          />

          <SelectField<PlatformTag>
            label="Plataforma"
            allLabel="Plataforma: todas"
            value={platform}
            onChange={(next) => {
              setPlatform(next);
              setVisible(PAGE_SIZE);
            }}
            options={[...PLATFORM_ORDER, "other" as const]
              .filter((p) => counts.platforms.has(p))
              .map((p) => ({ value: p, label: PLATFORM_LABEL[p], count: counts.platforms.get(p) }))}
          />

          <SelectField<AdCondition>
            label="Estado"
            allLabel="Estado: todos"
            value={condition}
            onChange={(next) => {
              setCondition(next);
              setVisible(PAGE_SIZE);
            }}
            options={(Object.keys(CONDITION_LABELS) as AdCondition[])
              .filter((c) => counts.conditions.has(c))
              .map((c) => ({ value: c, label: CONDITION_LABELS[c], count: counts.conditions.get(c) }))}
          />

          <SelectField
            label="Zona"
            allLabel="Zona: todas"
            value={zone}
            onChange={(next) => {
              setZone(next);
              setVisible(PAGE_SIZE);
            }}
            options={zoneOptions}
          />

          <SelectField<SortOrder>
            label="Ordenar"
            allLabel="Mais recentes"
            value={sort === "recent" ? "all" : sort}
            onChange={(next) => setSort(next === "all" ? "recent" : (next as SortOrder))}
            options={[
              { value: "price_asc", label: "Preço: mais baixo" },
              { value: "price_desc", label: "Preço: mais alto" },
            ]}
          />

          <Toggle
            checked={withPhoto}
            onChange={(next) => {
              setWithPhoto(next);
              setVisible(PAGE_SIZE);
            }}
          >
            Só com foto
          </Toggle>
        </div>

        <ActiveFilters
          chips={chips}
          onClearAll={clearAll}
          resultCount={filtered.length}
          totalCount={ads.length}
          noun="anúncios"
        />

        {state === "loading" && (
          <SkeletonRow tiles={6} className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" />
        )}
        {state === "error" && (
          <div className="mt-8">
            <ApiError what="os anúncios" />
          </div>
        )}

        {state !== "loading" && state !== "error" && filtered.length === 0 && (
          <div className="mt-8">
            <EmptyState
              action={
                chips.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="focus-glow rounded-lg border border-surface-border px-5 py-2.5 font-mono text-xs text-white/70 hover:border-white/30 hover:text-white"
                  >
                    Limpar filtros
                  </button>
                ) : undefined
              }
            >
              {ads.length > 0
                ? "Nenhum anúncio corresponde a estes filtros."
                : "Sem anúncios ativos neste momento — volta mais tarde, ou publica o teu no Discord."}
            </EmptyState>
          </div>
        )}

        {filtered.length > 0 && (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0, visible).map((ad) => (
                <AdCard key={ad.id} ad={ad} />
              ))}
            </div>

            {visible < filtered.length && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                  className="focus-glow rounded-lg border border-surface-border px-6 py-2.5 font-mono text-xs tracking-wide text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                  Mostrar mais ({filtered.length - visible} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
