import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LazyImage } from "../components/LazyImage";
import { Lightbox } from "../components/Lightbox";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { api } from "../lib/api/client";
import { normalizePlatform, type PlatformTag } from "../lib/normalize";
import { PLATFORM_ORDER } from "../lib/platforms";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

const PAGE_SIZE = 60;

/**
 * M8.8 — screenshots gallery. Fetches the full public set in one call
 * (`/api/screenshots` with the raised `MAX_LIMIT`, see
 * portal/api/src/routes/pagination.ts) rather than server-side-paginating,
 * because the platform filter is normalised client-side (M8.4 lives in
 * `portal/web` only) — filtering a server page would show fewer results
 * than expected whenever a filter is active. At 624 rows of small JSON
 * metadata this is cheap; the images themselves are what's guarded, via
 * `LazyImage`'s viewport gating (see that file's header for what "on the
 * fly thumbnails" could and couldn't be built here) and the "carregar mais"
 * button below capping how many grid tiles exist in the DOM at once.
 *
 * Handles the two known-dead 2022 Discord CDN links (and any other missing
 * `imageUrl`) via `LazyImage`'s broken-image fallback — a row with no
 * working image still counts and still appears, it just shows a
 * placeholder instead of silently vanishing from the grid.
 */
export function Screenshots() {
  useDocumentHead({
    title: "Screenshots",
    description: "Galeria de screenshots partilhadas pela comunidade Game On Portugal.",
    path: "/screenshots",
  });

  const { state, data } = useApi(
    () => api.listScreenshots(700),
    [],
    (value) => value.screenshots.length === 0,
  );

  const [platform, setPlatform] = useState<PlatformTag | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const items = data?.screenshots ?? [];
    if (platform === "all") return items;
    return items.filter((shot) => normalizePlatform(shot.platform) === platform);
  }, [data, platform]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">Screenshots</h1>
          <p className="mt-1 text-sm text-white/60">A galeria da comunidade — {data?.total ?? "…"} publicadas.</p>
        </div>
        <Link to="/screenshots/hall-of-fame" className="focus-glow text-sm text-accent-blue hover:underline">
          Hall of Fame →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="focus-glow chamfer border border-surface-border bg-surface px-3 py-2 text-sm text-white"
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value as PlatformTag | "all");
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <option value="all">Plataforma: todas</option>
          {PLATFORM_ORDER.map((p) => (
            <option key={p} value={p}>
              {p === "playstation" ? "PlayStation" : p === "xbox" ? "Xbox" : p === "nintendo" ? "Nintendo" : "PC"}
            </option>
          ))}
          <option value="other">Outra</option>
        </select>
      </div>

      {state === "loading" && (
        <SkeletonRow tiles={12} className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6" />
      )}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="as screenshots" />
        </div>
      )}
      {state !== "loading" && state !== "error" && filtered.length === 0 && (
        <div className="mt-6">
          <EmptyState>Ainda sem screenshots publicadas. Sê o primeiro a partilhar uma no Discord!</EmptyState>
        </div>
      )}

      {state !== "loading" && state !== "error" && visible.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {visible.map((shot, i) => (
              <LazyImage
                key={shot.id}
                src={shot.imageUrl}
                alt={shot.name ?? "Screenshot"}
                className="chamfer aspect-square overflow-hidden border border-surface-border bg-surface"
                onClick={() => setLightboxIndex(i)}
              />
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="focus-glow chamfer border border-surface-border px-6 py-2 text-sm text-white/80 hover:text-white"
              >
                Carregar mais ({filtered.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </>
      )}

      {lightboxIndex !== null && (
        <Lightbox items={visible} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </div>
  );
}
