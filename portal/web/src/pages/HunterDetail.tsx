import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HoloCard } from "../components/HoloCard";
import { Monogram } from "../components/PlayerCard";
import { EmptyState, SkeletonRows } from "../components/StateViews";
import { SearchField, SegmentedControl } from "../components/ui/Controls";
import { api, type HunterTrophy } from "../lib/api/client";
import { gameFromTrophyUrl, psnProfileUrl } from "../lib/psn";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

type Sort = "recent" | "points" | "name";

const DATE_FORMAT = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" });
const MONTH_FORMAT = new Intl.DateTimeFormat("pt-PT", { month: "short", year: "numeric" });

/**
 * M11 — one hunter's platinum collection.
 *
 * The whole page rests on one fact: **the game is recoverable from the stored
 * trophy URL**. `trophies` has no game column — only `url`, `points` and
 * `completionDate` — but the URL the bot captured
 * (`PsnProfilesTrophySource.parseProfileTrophies`) is of the form
 * `/trophies/<id>-<game-slug>/<profile>`, so the slug is the game. See
 * src/lib/psn.ts. No new scraping, no schema change, no third-party call at
 * request time.
 *
 * What this page deliberately does NOT show, and why:
 *
 *   - **A PSN avatar.** `trophyprofiles` stores `userId` and `psnProfile` and
 *     nothing else; the scraper never parses an avatar. Fetching one would
 *     mean scraping psnprofiles.com per page view, from the web tier, against
 *     a site the bot deliberately throttles to one request per second. The
 *     monogram tile is the honest stand-in until the bot persists an avatar.
 *   - **A Discord name or avatar.** That needs the raw Discord id, which
 *     portal-api never exposes by design (privacy decision 5 — see
 *     portal/api/src/repositories/visibility.ts), and a bot token portal-api
 *     does not hold. Both are decisions to take deliberately, not to slip in
 *     behind an avatar.
 *
 * A profile that is excluded or has opted out 404s from the API, so this page
 * cannot be used to look up someone who chose not to be listed.
 */
export function HunterDetail() {
  const { psnProfile = "" } = useParams<{ psnProfile: string }>();
  const { state, data } = useApi(() => api.hunter(psnProfile), [psnProfile], () => false);

  const hunter = data?.hunter;

  useDocumentHead({
    title: hunter ? `${hunter.psnProfile} — Hall of Fame` : "Caçador",
    description: hunter
      ? `${hunter.psnProfile} tem ${hunter.trophyCount} platinas e ${hunter.points.toLocaleString("pt-PT")} pontos no ranking da Game On Portugal.`
      : undefined,
    path: `/trophies/${encodeURIComponent(psnProfile)}`,
  });

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const games = useMemo(() => {
    const list = (hunter?.trophies ?? []).map((trophy) => ({
      trophy,
      game: gameFromTrophyUrl(trophy.url),
      date: trophy.completionDate ? new Date(trophy.completionDate) : null,
    }));

    const term = query.trim().toLowerCase();
    const matched = term
      ? list.filter((item) => (item.game?.title ?? "").toLowerCase().includes(term))
      : list;

    const sorted = [...matched];
    if (sort === "points") {
      sorted.sort((a, b) => b.trophy.points - a.trophy.points);
    } else if (sort === "name") {
      sorted.sort((a, b) => (a.game?.title ?? "").localeCompare(b.game?.title ?? "", "pt-PT"));
    } else {
      // Newest first; a trophy with no completion date sinks to the bottom
      // rather than being dropped — it still counts toward the totals.
      sorted.sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity));
    }
    return sorted;
  }, [hunter, query, sort]);

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <SkeletonRows rows={10} />
      </div>
    );
  }

  if (state === "error" || !hunter) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold uppercase">Caçador não encontrado</h1>
        <p className="mt-3 text-white/60">
          Este perfil não está no ranking público — pode não ter platinas registadas, ter saído da comunidade, ou ter
          pedido para não aparecer publicamente.
        </p>
        <Link
          to="/trophies"
          className="focus-glow chamfer mt-8 inline-block bg-accent-yellow px-6 py-3 font-bold text-background"
        >
          Voltar ao Hall of Fame
        </Link>
      </div>
    );
  }

  const dates = hunter.trophies
    .map((trophy) => (trophy.completionDate ? new Date(trophy.completionDate) : null))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const firstPlatinum = dates[0];
  const lastPlatinum = dates[dates.length - 1];
  const averagePoints = Math.round(hunter.points / Math.max(1, hunter.trophyCount));

  return (
    <div>
      <div className="border-b border-surface-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-10 lg:grid-cols-[1fr_300px]">
          <div>
            <Link
              to="/trophies"
              className="focus-glow rounded font-mono text-xs text-white/45 transition-colors hover:text-white"
            >
              ← Hall of Fame
            </Link>

            <div className="mt-5 flex items-center gap-4">
              <Monogram name={hunter.psnProfile} className="h-14 w-14 rounded-xl text-2xl" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-5xl leading-none font-extrabold uppercase">
                  {hunter.psnProfile}
                </h1>
                <p className="mt-2 font-mono text-[11px] tracking-[0.16em] text-white/45 uppercase">
                  Rank #{hunter.rank} · caçador de platinas
                </p>
              </div>
            </div>

            <dl className="mt-8 grid max-w-lg grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
              <Stat label="Pontos" value={hunter.points.toLocaleString("pt-PT")} accent="var(--color-accent-yellow)" />
              <Stat
                label="Platinas"
                value={hunter.trophyCount.toLocaleString("pt-PT")}
                accent="var(--color-accent-mint)"
              />
              <Stat label="Média" value={averagePoints.toLocaleString("pt-PT")} />
              <Stat label="Última" value={lastPlatinum ? MONTH_FORMAT.format(lastPlatinum) : "—"} />
            </dl>

            <a
              href={psnProfileUrl(hunter.psnProfile)}
              target="_blank"
              rel="noreferrer"
              className="focus-glow mt-8 inline-flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2.5 text-sm font-semibold transition-colors hover:border-white/30"
            >
              Ver perfil no PSNProfiles
              <span aria-hidden className="text-white/40">
                ↗
              </span>
            </a>
          </div>

          <div className="mx-auto w-full max-w-[280px] lg:max-w-none">
            <HoloCard ratio="aspect-[63/78]">
              <div className="flex items-start justify-between">
                <span className="rounded border border-white/25 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-white/70">
                  CAÇADOR
                </span>
                <span className="tabular font-display text-3xl leading-none font-extrabold text-accent-yellow">
                  #{hunter.rank}
                </span>
              </div>

              <div className="grid min-h-0 flex-1 place-items-center py-4">
                <Monogram name={hunter.psnProfile} className="h-20 w-20 rounded-2xl text-4xl" />
              </div>

              <p className="truncate font-display text-3xl leading-none font-extrabold uppercase">
                {hunter.psnProfile}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-white/15 pt-3.5 text-center">
                <div>
                  <dd className="tabular font-display text-2xl leading-none font-extrabold text-accent-yellow">
                    {hunter.points.toLocaleString("pt-PT")}
                  </dd>
                  <dt className="mt-1.5 font-mono text-[8px] tracking-[0.12em] text-white/45">PONTOS</dt>
                </div>
                <div>
                  <dd className="tabular font-display text-2xl leading-none font-extrabold text-accent-mint">
                    {hunter.trophyCount}
                  </dd>
                  <dt className="mt-1.5 font-mono text-[8px] tracking-[0.12em] text-white/45">PLATINAS</dt>
                </div>
              </dl>
            </HoloCard>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-surface-border pb-4">
          <h2 className="font-display text-3xl font-extrabold uppercase">
            As platinas
            {firstPlatinum && (
              <span className="ml-3 font-mono text-[11px] font-normal tracking-normal text-white/35 normal-case">
                desde {MONTH_FORMAT.format(firstPlatinum)}
              </span>
            )}
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <SearchField value={query} onChange={setQuery} label="Procurar jogo" placeholder="Procurar jogo…" />
            <SegmentedControl<Sort>
              label="Ordenar"
              value={sort}
              onChange={setSort}
              options={[
                { value: "recent", label: "Recentes", accent: "var(--color-accent-mint)" },
                { value: "points", label: "Pontos", accent: "var(--color-accent-yellow)" },
                { value: "name", label: "A-Z", accent: "var(--color-accent-blue)" },
              ]}
            />
          </div>
        </div>

        <p className="mt-4 font-mono text-xs text-white/40">
          <span className="tabular text-white">{games.length.toLocaleString("pt-PT")}</span>
          {query.trim() !== "" && <> de {hunter.trophyCount.toLocaleString("pt-PT")}</>} platinas
        </p>

        {games.length === 0 ? (
          <div className="mt-6">
            <EmptyState>Nenhum jogo corresponde a “{query.trim()}”.</EmptyState>
          </div>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((item, index) => (
              <li key={item.trophy.url ?? index}>
                <GameCard trophy={item.trophy} title={item.game?.title ?? null} href={item.game?.url ?? item.trophy.url} date={item.date} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <dd className="tabular font-display text-2xl leading-none font-extrabold" style={{ color: accent }}>
        {value}
      </dd>
      <dt className="mt-2 font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase">{label}</dt>
    </div>
  );
}

function GameCard({
  trophy,
  title,
  href,
  date,
}: {
  trophy: HunterTrophy;
  title: string | null;
  href: string | null;
  date: Date | null;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] leading-snug font-semibold">
          {/* A URL this parser did not recognise still shows as a trophy —
              it just cannot be named. Better an honest unnamed platinum than
              a title invented from a slug we did not understand. */}
          {title ?? "Platina"}
        </h3>
        <span className="tabular shrink-0 font-display text-2xl leading-none font-extrabold text-accent-yellow">
          {trophy.points}
        </span>
      </div>
      <p className="mt-3 flex items-center gap-2 font-mono text-[10px] tracking-wide text-white/40">
        <span aria-hidden>🏆</span>
        {date ? DATE_FORMAT.format(date) : "Data desconhecida"}
      </p>
    </>
  );

  const className =
    "shine block h-full rounded-xl border border-surface-border bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-white/25";

  if (!href) return <div className={className}>{body}</div>;

  return (
    <a href={href} target="_blank" rel="noreferrer" className={`focus-glow ${className}`}>
      {body}
    </a>
  );
}
