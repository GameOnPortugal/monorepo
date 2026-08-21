import { ApiError, EmptyState } from "../components/StateViews";
import { api } from "../lib/api/client";
import { useApi } from "../lib/useApi";

// Top-3 highlight via a left border, not text colour — src/lib/platforms.ts's
// contrast table is why: yellow (rank 1) is AAA-safe as text (19.02:1) so it
// gets both, but red (rank 3, 4.87:1 — "technically AA-passing but
// marginal") stays out of text entirely here, matching the stricter line
// M8.5 already drew for this exact colour ("even the one place that seemed
// safe, error-copy, uses a red left border with white text instead" — see
// GLOBAL-PLAN.md's M8.5 row). Accents are for fills/borders/icons.
const RANK_BORDER: Record<number, string> = {
  1: "border-accent-yellow",
  2: "border-white/40",
  3: "border-accent-red",
};
const RANK_TEXT: Record<number, string> = {
  1: "text-accent-yellow",
};

/**
 * M8.9 — trophy leaderboard. The plan-03 pages table and the M8.9 row in
 * GLOBAL-PLAN both originally called for an honest "data frozen at
 * 2024-12-02" notice — that was true when this task was scoped, but the
 * task brief for THIS agent is explicit that M7 (the trophy sync port)
 * landed the same night (commit history: M7.1-M7.7, "feat(trophies): ...").
 * Adding a stale-data banner here would be actively wrong, not just
 * outdated, so it is deliberately absent — see the M8.9 row in
 * docs/plans/GLOBAL-PLAN.md for this call spelled out.
 *
 * Numbers match `/trophy rank` for the same query by construction:
 * `portal/api`'s `getLeaderboard` (src/repositories/trophies.ts) mirrors
 * `OrmTrophyRepository.queryRankedHunters`'s SQL shape exactly (same
 * `isExcluded` filter, same tie-break order) — see that file's header.
 */
export function Trophies() {
  const { state, data } = useApi(
    () => api.leaderboard(100),
    [],
    (value) => value.leaderboard.length === 0,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl">Trophy leaderboard</h1>
      <p className="mt-1 text-sm text-white/60">
        Ranking por pontos de troféus somados por perfil. Sincronizado periodicamente com a PSN — pode estar alguns
        minutos atrás do que vês no Discord.
      </p>

      {state === "loading" && (
        <div className="mt-6 space-y-2" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => i).map((key) => (
            <div key={key} className="chamfer h-12 animate-pulse border border-surface-border bg-surface" />
          ))}
        </div>
      )}
      {state === "error" && (
        <div className="mt-6">
          <ApiError what="o leaderboard" />
        </div>
      )}
      {state === "empty" && (
        <div className="mt-6">
          <EmptyState>Sem troféus registados ainda.</EmptyState>
        </div>
      )}

      {state === "ready" && data && (
        <ol className="mt-6 divide-y divide-surface-border border border-surface-border">
          {data.leaderboard.map((entry) => (
            <li
              key={entry.rank}
              className={`flex items-center justify-between border-l-2 px-4 py-3 ${
                RANK_BORDER[entry.rank] ?? "border-transparent"
              }`}
            >
              <span className="flex items-center gap-4">
                <span className={`w-8 text-right font-display text-lg ${RANK_TEXT[entry.rank] ?? "text-white/50"}`}>
                  {entry.rank}
                </span>
                <span>{entry.psnProfile ?? "Perfil sem nome"}</span>
              </span>
              <span className="text-sm text-white/60">
                {entry.points.toLocaleString("pt-PT")} pts · {entry.trophyCount} troféus
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
