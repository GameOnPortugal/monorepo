import { useMemo, useState } from "react";
import { AdCard } from "../components/AdCard";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { api } from "../lib/api/client";
import {
  CONDITION_LABELS,
  type AdCondition,
  normalizeCondition,
  normalizePlatform,
  normalizeZone,
  type PlatformTag,
} from "../lib/normalize";
import { PLATFORM_ORDER } from "../lib/platforms";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

type AdTypeFilter = "all" | "sell" | "wanted";
type SortOrder = "recent" | "price_asc" | "price_desc";
// "all" (no filter) or a normalized zone label ("Lisboa", "Online", "Outra",
// ...) — built from whatever districts/buckets actually appear in the
// currently-loaded ad set, not a hardcoded list, so it never offers an empty
// filter option.
type ZoneFilter = "all" | string;

/**
 * M8.7 — Marketplace grid + filters. All filtering happens client-side over
 * one fetch of the active set (currently ~40 rows post-expiry per the task
 * brief's "28 were just expired" note — small enough that a single `?limit=`
 * call and in-memory filtering is simpler and more consistent than teaching
 * `portal/api` to filter by *normalised* platform/condition/zone, which
 * would mean duplicating M8.4's mapping server-side). If the active count
 * grows by an order of magnitude this should move server-side — noted as a
 * scaling follow-up, not a correctness gap today.
 */
export function Marketplace() {
  useDocumentHead({
    title: "Marketplace",
    description: "Anúncios de compra e venda entre membros da comunidade Game On Portugal.",
    path: "/marketplace",
  });

  const { state, data } = useApi(
    () => api.listAds(200),
    [],
    (value) => value.ads.length === 0,
  );

  const [adType, setAdType] = useState<AdTypeFilter>("all");
  const [platform, setPlatform] = useState<PlatformTag | "all">("all");
  const [condition, setCondition] = useState<AdCondition | "all">("all");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [sort, setSort] = useState<SortOrder>("recent");

  const zoneOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const ad of data?.ads ?? []) {
      const normalized = normalizeZone(ad.zone);
      if (normalized) labels.add(normalized.label);
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "pt-PT"));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let ads = data.ads;
    if (adType !== "all") ads = ads.filter((ad) => ad.adType === adType);
    if (platform !== "all") ads = ads.filter((ad) => normalizePlatform(ad.state) === platform);
    if (condition !== "all") ads = ads.filter((ad) => normalizeCondition(ad.state) === condition);
    if (zone !== "all") ads = ads.filter((ad) => normalizeZone(ad.zone)?.label === zone);

    if (sort === "price_asc" || sort === "price_desc") {
      const withPrice = ads.filter((ad) => ad.price_cents != null);
      const withoutPrice = ads.filter((ad) => ad.price_cents == null);
      withPrice.sort((a, b) =>
        sort === "price_asc" ? a.price_cents! - b.price_cents! : b.price_cents! - a.price_cents!,
      );
      ads = [...withPrice, ...withoutPrice];
    }
    return ads;
  }, [data, adType, platform, condition, sort]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-2xl">Marketplace</h1>
      <p className="mt-1 text-sm text-white/60">Anúncios de compra e venda entre membros da comunidade.</p>

      <Filters
        adType={adType}
        onAdType={setAdType}
        platform={platform}
        onPlatform={setPlatform}
        condition={condition}
        onCondition={setCondition}
        zone={zone}
        onZone={setZone}
        zoneOptions={zoneOptions}
        sort={sort}
        onSort={setSort}
      />

      {state === "loading" && (
        <SkeletonRow className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3" tiles={6} />
      )}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="os anúncios" />
        </div>
      )}
      {state !== "loading" && state !== "error" && filtered.length === 0 && (
        <div className="mt-6">
          <EmptyState>
            {data && data.ads.length > 0
              ? "Nenhum anúncio corresponde a estes filtros."
              : "Sem anúncios ativos neste momento — volta mais tarde ou publica o teu no Discord."}
          </EmptyState>
        </div>
      )}
      {state !== "loading" && state !== "error" && filtered.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {filtered.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}

function Filters({
  adType,
  onAdType,
  platform,
  onPlatform,
  condition,
  onCondition,
  zone,
  onZone,
  zoneOptions,
  sort,
  onSort,
}: {
  adType: AdTypeFilter;
  onAdType: (v: AdTypeFilter) => void;
  platform: PlatformTag | "all";
  onPlatform: (v: PlatformTag | "all") => void;
  condition: AdCondition | "all";
  onCondition: (v: AdCondition | "all") => void;
  zone: ZoneFilter;
  onZone: (v: ZoneFilter) => void;
  zoneOptions: string[];
  sort: SortOrder;
  onSort: (v: SortOrder) => void;
}) {
  const selectClass =
    "focus-glow chamfer border border-surface-border bg-surface px-3 py-2 text-sm text-white";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <select className={selectClass} value={adType} onChange={(e) => onAdType(e.target.value as AdTypeFilter)}>
        <option value="all">Tipo: todos</option>
        <option value="sell">À venda</option>
        <option value="wanted">Procura-se</option>
      </select>

      <select
        className={selectClass}
        value={platform}
        onChange={(e) => onPlatform(e.target.value as PlatformTag | "all")}
      >
        <option value="all">Plataforma: todas</option>
        {PLATFORM_ORDER.map((p) => (
          <option key={p} value={p}>
            {p === "playstation" ? "PlayStation" : p === "xbox" ? "Xbox" : p === "nintendo" ? "Nintendo" : "PC"}
          </option>
        ))}
        <option value="other">Outra</option>
      </select>

      <select
        className={selectClass}
        value={condition}
        onChange={(e) => onCondition(e.target.value as AdCondition | "all")}
      >
        <option value="all">Estado: todos</option>
        {Object.entries(CONDITION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select className={selectClass} value={zone} onChange={(e) => onZone(e.target.value)}>
        <option value="all">Zona: todas</option>
        {zoneOptions.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>

      <select className={selectClass} value={sort} onChange={(e) => onSort(e.target.value as SortOrder)}>
        <option value="recent">Mais recentes</option>
        <option value="price_asc">Preço: mais baixo</option>
        <option value="price_desc">Preço: mais alto</option>
      </select>
    </div>
  );
}
