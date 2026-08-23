import { useMemo, useState } from "react";
import { LazyImage } from "../components/LazyImage";
import { AuthorCredit } from "../components/AuthorCredit";
import { Lightbox } from "../components/Lightbox";
import { WinnerBadge } from "../components/WinnerBadge";
import { HelpLink, PageHeader } from "../components/PageHeader";
import { PlatformBadge } from "../components/PlatformBadge";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { ActiveFilters, SearchField, SegmentedControl, SelectField } from "../components/ui/Controls";
import { api, thumbnailUrl } from "../lib/api/client";
import { normalizePlatform, type PlatformTag } from "../lib/normalize";
import { PLATFORM_ORDER, PLATFORMS } from "../lib/platforms";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

const PAGE_SIZE = 48;

type Sort = "recent" | "oldest";

const PLATFORM_LABEL: Record<PlatformTag, string> = {
  playstation: PLATFORMS.playstation.label,
  xbox: PLATFORMS.xbox.label,
  nintendo: PLATFORMS.nintendo.label,
  pc: PLATFORMS.pc.label,
  other: "Outra",
};

/**
 * M8.8 + M11 — the screenshots gallery.
 *
 * Fetches the full public set in one call (`/api/screenshots` with the raised
 * MAX_LIMIT) rather than server-paginating, because the platform filter is
 * normalised client-side (M8.4 lives in `portal/web` only) — filtering a
 * server page would show fewer results than the count promises. At ~624 rows
 * of small JSON metadata this is cheap; the *images* are what's guarded, via
 * `LazyImage`'s viewport gating, `thumbnailUrl()`'s resized WebP, and the
 * paging below capping how many tiles exist in the DOM at once.
 *
 * M11 adds a year filter and a title search — the gallery spans years and
 * "show me 2023" was previously only reachable by scrolling. Platform is now
 * a set of counted chips rather than a bare dropdown, since there are only
 * five buckets and a visible count is the useful part.
 *
 * M10.5/M10.8 — screenshots are now **credited**, which the header note here
 * used to say was impossible. It was, for two reasons that have both since
 * been fixed rather than argued away: nothing on the other side of
 * `screenshots.author_id` held a name (the bot now caches one per member —
 * `discord_profiles`), and an avatar would have meant hot-linking Discord's
 * CDN (the bot now re-hosts it to MinIO, keyed by avatar hash so no public
 * URL carries a member's snowflake). `author_id`/`channel_id`/`message_id`
 * are still never exposed; what arrives here is a name, a re-hosted avatar
 * and a derived permalink. Winners of a contest week carry a badge.
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
  const [year, setYear] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const shots = useMemo(() => data?.screenshots ?? [], [data]);

  const counts = useMemo(() => {
    const platforms = new Map<PlatformTag, number>();
    const years = new Map<string, number>();
    for (const shot of shots) {
      const p = normalizePlatform(shot.platform);
      if (p) platforms.set(p, (platforms.get(p) ?? 0) + 1);
      const y = String(new Date(shot.createdAt).getFullYear());
      if (y !== "NaN") years.set(y, (years.get(y) ?? 0) + 1);
    }
    return { platforms, years };
  }, [shots]);

  const yearOptions = useMemo(
    () =>
      Array.from(counts.years.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([value, count]) => ({ value, label: value, count })),
    [counts],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let result = shots;

    if (platform !== "all") result = result.filter((shot) => normalizePlatform(shot.platform) === platform);
    if (year !== "all") result = result.filter((shot) => String(new Date(shot.createdAt).getFullYear()) === year);
    if (term) result = result.filter((shot) => (shot.name ?? "").toLowerCase().includes(term));

    if (sort === "oldest") {
      result = [...result].reverse();
    }
    return result;
  }, [shots, platform, year, query, sort]);

  const visibleShots = filtered.slice(0, visible);

  const chips = [
    query.trim() && { key: "q", label: `“${query.trim()}”`, onRemove: () => setQuery("") },
    platform !== "all" && {
      key: "platform",
      label: PLATFORM_LABEL[platform],
      onRemove: () => setPlatform("all"),
    },
    year !== "all" && { key: "year", label: year, onRemove: () => setYear("all") },
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  function clearAll() {
    setQuery("");
    setPlatform("all");
    setYear("all");
    setVisible(PAGE_SIZE);
  }

  return (
    <div>
      <PageHeader
        eyebrow="A parede da comunidade"
        title="Screenshots"
        description="As melhores capturas partilhadas no Discord. Todas as semanas há uma vencedora — a que juntar mais reações."
        stats={[
          {
            label: "Publicadas",
            value: data?.total?.toLocaleString("pt-PT") ?? "···",
            accent: "var(--color-accent-mint)",
          },
          { label: "Anos", value: String(yearOptions.length || "·"), accent: "var(--color-accent-yellow)" },
        ]}
      >
        <HelpLink to="/como-participar#screenshots">Como partilhar a tua</HelpLink>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            value={query}
            onChange={(next) => {
              setQuery(next);
              setVisible(PAGE_SIZE);
            }}
            label="Procurar screenshots"
            placeholder="Procurar por jogo…"
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

          <SelectField
            label="Ano"
            allLabel="Ano: todos"
            value={year}
            onChange={(next) => {
              setYear(next);
              setVisible(PAGE_SIZE);
            }}
            options={yearOptions}
          />

          <SegmentedControl<Sort>
            label="Ordenar"
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: "Recentes", accent: "var(--color-accent-mint)" },
              { value: "oldest", label: "Antigas", accent: "var(--color-accent-yellow)" },
            ]}
          />
        </div>

        <ActiveFilters
          chips={chips}
          onClearAll={clearAll}
          resultCount={filtered.length}
          totalCount={shots.length}
          noun="screenshots"
        />

        {state === "loading" && (
          <SkeletonRow tiles={12} className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" />
        )}
        {state === "error" && (
          <div className="mt-8">
            <ApiError what="as screenshots" />
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
              {shots.length > 0
                ? "Nenhuma screenshot corresponde a estes filtros."
                : "Ainda sem screenshots publicadas. Sê o primeiro a partilhar uma no Discord!"}
            </EmptyState>
          </div>
        )}

        {visibleShots.length > 0 && (
          <>
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleShots.map((shot, index) => {
                const tag = normalizePlatform(shot.platform);
                return (
                  <li key={shot.id} className="group relative overflow-hidden rounded-xl border border-surface-border">
                    <LazyImage
                      src={thumbnailUrl(shot.imageUrl, 480)}
                      alt={shot.name ?? "Screenshot"}
                      className="aspect-[4/3] w-full overflow-hidden bg-surface transition-transform duration-500 group-hover:scale-[1.06]"
                      onClick={() => setLightboxIndex(index)}
                    />
                    {/* Outside the hover overlay: a winner badge is the one
                        thing about a tile worth seeing without hovering, and
                        on a touch device there is no hover at all. */}
                    {shot.winner && (
                      <span className="pointer-events-none absolute top-2 left-2">
                        <WinnerBadge voteCount={shot.winner.voteCount} />
                      </span>
                    )}
                    {/* `pointer-events-none` on the overlay, re-enabled on the
                        credit alone: the tile itself opens the lightbox, and
                        the author's permalink must stay clickable inside it. */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-background/95 via-background/70 to-transparent px-3 pt-10 pb-3 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                      <p className="line-clamp-1 text-xs font-semibold">{shot.name ?? "Sem título"}</p>
                      <p className="mt-1.5 flex items-center gap-2">
                        {tag && <PlatformBadge platform={tag} />}
                        <span className="font-mono text-[10px] text-white/45">
                          {new Date(shot.createdAt).getFullYear()}
                        </span>
                      </p>
                      {shot.author && (
                        <span className="pointer-events-auto mt-1.5 flex">
                          <AuthorCredit author={shot.author} messageUrl={shot.messageUrl} />
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

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

      {lightboxIndex !== null && (
        <Lightbox
          items={visibleShots}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
