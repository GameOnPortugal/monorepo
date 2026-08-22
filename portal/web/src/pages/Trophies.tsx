import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpLink, PageHeader } from "../components/PageHeader";
import { Monogram, PlayerCard } from "../components/PlayerCard";
import { ApiError, EmptyState, SkeletonRow, SkeletonRows } from "../components/StateViews";
import { SearchField } from "../components/ui/Controls";
import { api } from "../lib/api/client";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

const PAGE_SIZE = 25;

// The route clamps `limit` to 100 (portal/api/src/routes/trophies.ts), so this
// board is the top 100 and says so — rather than implying it is everyone.
const BOARD_SIZE = 100;

/**
 * M8.9 + M11 — the trophy leaderboard, rebuilt as the Hall of Fame.
 *
 * Numbers match `/trophy rank` for the same query by construction:
 * `portal/api`'s `getLeaderboard` (src/repositories/trophies.ts) mirrors
 * `OrmTrophyRepository.queryRankedHunters`'s SQL shape exactly — same
 * `isExcluded` filter, same tie-break order.
 *
 * M11 adds the podium, a name search over the loaded board, a points bar so
 * the gap between hunters is legible at a glance, and a route into each
 * hunter's own platinum list (`/trophies/:psnProfile`) — which is the thing
 * this page was missing: it showed a ranking and gave you nowhere to go.
 *
 * No stale-data banner: M7's sync port landed, so the numbers are live. The
 * header says "sincronizado periodicamente" rather than claiming real-time,
 * which is the honest description of a cron-driven scrape.
 */
export function Trophies() {
  useDocumentHead({
    title: "Hall of Fame",
    description: "Ranking de troféus da comunidade Game On Portugal — os caçadores de platinas da comunidade.",
    path: "/trophies",
  });

  const board = useApi(
    () => api.leaderboard(BOARD_SIZE),
    [],
    (value) => value.leaderboard.length === 0,
  );
  const stats = useApi(() => api.stats(), [], () => false);

  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const entries = board.data?.leaderboard ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rest;
    return rest.filter((entry) => (entry.psnProfile ?? "").toLowerCase().includes(term));
  }, [rest, query]);

  // The bar is scaled to the leader, not to the visible slice — otherwise the
  // bars would rescale as you search or page, making the same hunter look
  // different depending on how you got there.
  const topPoints = entries[0]?.points ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Caçadores de platinas"
        title="Hall of Fame"
        description="Ranking por pontos de platinas somados por perfil, sincronizado periodicamente com o PSNProfiles. Pode estar alguns minutos atrás do que vês no Discord."
        stats={[
          {
            label: "Caçadores",
            value: stats.data?.hunters?.toLocaleString("pt-PT") ?? "···",
            accent: "var(--color-accent-blue)",
          },
          {
            label: "Platinas",
            value: stats.data?.trophies?.toLocaleString("pt-PT") ?? "···",
            accent: "var(--color-accent-yellow)",
          },
        ]}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <HelpLink to="/como-participar#ranking">Como entrar no ranking</HelpLink>
          {/* Kept separate from the link above on purpose: "how do I join" and
              "why am I missing" are different questions asked by different
              people, and burying the second inside the first is how the
              excluded-but-fixable case goes unanswered (M10.11). */}
          <Link
            to="/como-participar#fora-do-ranking"
            className="focus-glow rounded font-mono text-xs text-white/50 transition-colors hover:text-white"
          >
            Não apareço aqui, porquê?
          </Link>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-10">
        {board.state === "loading" && (
          <>
            <SkeletonRow tiles={3} className="grid grid-cols-1 gap-4 sm:grid-cols-3" />
            <div className="mt-10">
              <SkeletonRows rows={8} />
            </div>
          </>
        )}

        {board.state === "error" && <ApiError what="o ranking" />}

        {board.state === "empty" && <EmptyState>Sem troféus registados ainda.</EmptyState>}

        {board.state === "ready" && (
          <>
            <section aria-labelledby="podio">
              <h2 id="podio" className="sr-only">
                Pódio
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {podium.map((entry) => (
                  <PlayerCard
                    key={entry.rank}
                    rank={entry.rank}
                    psnProfile={entry.psnProfile}
                    points={entry.points}
                    trophyCount={entry.trophyCount}
                    featured
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="tabela" className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-surface-border pb-4">
                <h2 id="tabela" className="font-display text-3xl font-extrabold uppercase">
                  A tabela
                </h2>
                <SearchField
                  value={query}
                  onChange={(next) => {
                    setQuery(next);
                    setVisible(PAGE_SIZE);
                  }}
                  label="Procurar caçador"
                  placeholder="Procurar caçador…"
                />
              </div>

              <p className="mt-4 font-mono text-xs text-white/40">
                <span className="tabular text-white">{filtered.length.toLocaleString("pt-PT")}</span>
                {query.trim() !== "" && <> de {rest.length.toLocaleString("pt-PT")}</>} caçadores · top {BOARD_SIZE}
              </p>

              {filtered.length === 0 ? (
                <div className="mt-6">
                  <EmptyState>Nenhum caçador corresponde a “{query.trim()}”.</EmptyState>
                </div>
              ) : (
                <ol className="mt-4 space-y-1.5">
                  {filtered.slice(0, visible).map((entry) => (
                    <li key={entry.rank}>
                      <HunterRow
                        rank={entry.rank}
                        psnProfile={entry.psnProfile}
                        points={entry.points}
                        trophyCount={entry.trophyCount}
                        topPoints={topPoints}
                      />
                    </li>
                  ))}
                </ol>
              )}

              {visible < filtered.length && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setVisible((count) => count + PAGE_SIZE)}
                    className="focus-glow rounded-lg border border-surface-border px-6 py-2.5 font-mono text-xs tracking-wide text-white/70 transition-colors hover:border-white/30 hover:text-white"
                  >
                    Mostrar mais ({filtered.length - visible} restantes)
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function HunterRow({
  rank,
  psnProfile,
  points,
  trophyCount,
  topPoints,
}: {
  rank: number;
  psnProfile: string | null;
  points: number;
  trophyCount: number;
  topPoints: number;
}) {
  const width = topPoints > 0 ? Math.max(2, Math.round((points / topPoints) * 100)) : 0;

  const inner = (
    <>
      <span className="tabular w-10 shrink-0 text-right font-display text-2xl leading-none font-extrabold text-white/25">
        {rank}
      </span>

      {psnProfile ? <Monogram name={psnProfile} /> : <span aria-hidden className="h-9 w-9 shrink-0 rounded-lg bg-white/10" />}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{psnProfile ?? "Perfil sem nome"}</span>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/8">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-accent-mint to-accent-blue"
            style={{ width: `${width}%` }}
          />
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tabular block font-display text-xl leading-none font-extrabold">
          {points.toLocaleString("pt-PT")}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-white/40">
          {trophyCount.toLocaleString("pt-PT")} platinas
        </span>
      </span>
    </>
  );

  const className =
    "shine flex items-center gap-3 rounded-xl border border-surface-border bg-surface px-4 py-3 transition-colors hover:border-white/25 sm:gap-4";

  if (!psnProfile) return <div className={className}>{inner}</div>;

  return (
    <Link to={`/trophies/${encodeURIComponent(psnProfile)}`} className={`focus-glow ${className}`}>
      {inner}
    </Link>
  );
}
