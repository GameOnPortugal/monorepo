import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthorCredit } from "../components/AuthorCredit";
import { LazyImage } from "../components/LazyImage";
import { Lightbox } from "../components/Lightbox";
import { PageHeader } from "../components/PageHeader";
import { PlatformBadge } from "../components/PlatformBadge";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { WinnerBadge } from "../components/WinnerBadge";
import { api, thumbnailUrl, type Winner } from "../lib/api/client";
import { normalizePlatform } from "../lib/normalize";
import { useApi } from "../lib/useApi";
import { useDocumentHead } from "../lib/seo";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/** Mirrors the bot's `COMMUNITY_TIMEZONE` — see WEEK_FORMAT below for why it matters here. */
const COMMUNITY_TIMEZONE = "Europe/Lisbon";

// Pinned to Europe/Lisbon, not the visitor's timezone. A contest week *is*
// defined in Lisbon local time — that is the whole point of
// COMMUNITY_TIMEZONE in the bot's ScreenshotWeekWindow.ts — and `weekEnd` is
// stored as Sunday 23:59:59.999 there. Formatted in the browser's own zone,
// anyone east of Portugal would see a week ending on Monday, and a week
// closing on 31 December would be filed under the wrong year. Two-digit day
// and month so the range reads as a column rather than ragged ("04/05", not
// "4/05").
const WEEK_FORMAT = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  timeZone: COMMUNITY_TIMEZONE,
});
const YEAR_FORMAT = new Intl.DateTimeFormat("pt-PT", { year: "numeric", timeZone: COMMUNITY_TIMEZONE });

/** The year a contest week closed in, in Lisbon — see WEEK_FORMAT. */
function contestYear(weekEnd: string): string | null {
  const date = new Date(weekEnd);
  return Number.isNaN(date.getTime()) ? null : YEAR_FORMAT.format(date);
}

function weekLabel(start: string, end: string): string {
  const from = new Date(start);
  const to = new Date(end);
  return `${WEEK_FORMAT.format(from)} – ${WEEK_FORMAT.format(to)} ${YEAR_FORMAT.format(to)}`;
}

/**
 * M10.8 — the Hall of Fame, for real.
 *
 * This page used to be a placeholder that explained, correctly, why it could
 * not exist: the weekly winner was computed live from Discord reaction counts
 * and never written down, so the database held no history to query. That is
 * fixed at the source — `WeekScreenshotWinner` now records the week it
 * announces, and `screenshots:backfill-winners` recovered the archive by
 * parsing announcements still sitting in `#screenshots` — 139 found, 137 of
 * them resolving to a surviving screenshot row, giving an archive that runs
 * from January 2022 to October 2024 (backfilled in production 2026-08-23).
 *
 * **Two honesty affordances**, both deliberate and both worth keeping:
 *
 *  - An entry recovered from history is marked `inferred`, and the page says
 *    what that means. It is a faithful copy of what was announced at the
 *    time — never a recomputation from today's reaction counts, which kept
 *    accumulating after each contest closed and would hand old weeks to the
 *    wrong people.
 *  - `total` counts every decided week, including those whose screenshot has
 *    since been deleted or whose author opted out of public visibility. When
 *    it exceeds what is shown, the page says so rather than quietly
 *    presenting a shorter history as the whole story.
 */
export function HallOfFame() {
  useDocumentHead({
    title: "Hall of Fame",
    description: "As screenshots vencedoras da semana na comunidade Game On Portugal.",
    path: "/screenshots/hall-of-fame",
  });

  const { state, data } = useApi(
    () => api.winners(500),
    [],
    (value) => value.winners.length === 0,
  );

  const [year, setYear] = useState<string>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const winners = useMemo(() => data?.winners ?? [], [data]);

  const years = useMemo(() => {
    const counts = new Map<string, number>();
    for (const winner of winners) {
      const value = contestYear(winner.weekEnd);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [winners]);

  const filtered = useMemo(
    () =>
      year === "all" ? winners : winners.filter((winner) => contestYear(winner.weekEnd) === year),
    [winners, year],
  );

  // The lightbox takes the same structural item the gallery gives it, so a
  // winner opens exactly like a screenshot does — including its credit.
  const lightboxItems = useMemo(
    () =>
      filtered.map((winner) => ({
        ...winner.screenshot,
        author: winner.author,
        winner: {
          weekStart: winner.weekStart,
          weekEnd: winner.weekEnd,
          voteCount: winner.voteCount,
          source: winner.source,
        },
      })),
    [filtered],
  );

  // Every decided week the API knows about, minus what it was willing to
  // show. See this file's doc comment.
  const withheld = Math.max(0, (data?.total ?? 0) - winners.length);

  return (
    <div>
      <PageHeader
        eyebrow="Hall of Fame · Screenshots"
        title="Vencedoras da semana"
        description="Todas as semanas, a screenshot com mais reações 🏆 no Discord ganha o concurso. Este é o arquivo, desde 2021."
        stats={[
          {
            label: "Semanas",
            value: winners.length ? winners.length.toLocaleString("pt-PT") : "···",
            accent: "var(--color-accent-yellow)",
          },
          { label: "Anos", value: String(years.length || "·"), accent: "var(--color-accent-mint)" },
        ]}
      >
        <Link
          to="/screenshots"
          className="focus-glow inline-flex items-center gap-1.5 rounded font-mono text-xs text-accent-blue transition-colors hover:text-white"
        >
          Ver a galeria completa <span aria-hidden>→</span>
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {years.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {[["all", "Todos"] as const, ...years.map(([value]) => [value, value] as const)].map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setYear(value)}
                  aria-pressed={year === value}
                  className={`focus-glow rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                    year === value
                      ? "border-accent-yellow text-accent-yellow"
                      : "border-surface-border text-white/60 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        )}

        {state === "loading" && (
          <SkeletonRow tiles={9} className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" />
        )}
        {state === "error" && (
          <div className="mt-8">
            <ApiError what="as vencedoras" />
          </div>
        )}

        {state === "empty" && (
          <div className="mt-8">
            <EmptyState
              action={
                <a
                  href={DISCORD_INVITE}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-glow chamfer inline-block bg-accent-yellow px-6 py-3 font-bold text-background transition-transform hover:-translate-y-0.5"
                >
                  Entrar no Discord
                </a>
              }
            >
              Ainda não há vencedoras registadas. A próxima é decidida no Discord, no fim desta semana.
            </EmptyState>
          </div>
        )}

        {filtered.length > 0 && (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((winner, index) => (
              <WinnerCard key={winner.weekStart} winner={winner} onOpen={() => setLightboxIndex(index)} />
            ))}
          </ul>
        )}

        {withheld > 0 && (
          <p className="mt-8 text-center text-xs text-white/40">
            {withheld === 1
              ? "Há mais 1 semana no arquivo que não é mostrada aqui — a screenshot foi apagada ou o autor pediu para não aparecer no portal."
              : `Há mais ${withheld} semanas no arquivo que não são mostradas aqui — as screenshots foram apagadas ou os autores pediram para não aparecer no portal.`}
          </p>
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

function WinnerCard({ winner, onOpen }: { winner: Winner; onOpen: () => void }) {
  const platform = normalizePlatform(winner.screenshot.platform);

  return (
    <li className="group overflow-hidden rounded-xl border border-surface-border bg-surface/40">
      <LazyImage
        src={thumbnailUrl(winner.screenshot.imageUrl, 480)}
        alt={winner.screenshot.name ?? "Screenshot vencedora"}
        className="aspect-[16/10] w-full overflow-hidden bg-surface transition-transform duration-500 group-hover:scale-[1.03]"
        onClick={onOpen}
      />

      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <WinnerBadge voteCount={winner.voteCount} weekLabel={weekLabel(winner.weekStart, winner.weekEnd)} />
          {platform && <PlatformBadge platform={platform} />}
        </div>

        <p className="line-clamp-1 text-sm font-semibold">{winner.screenshot.name ?? "Sem título"}</p>

        <div className="flex items-center justify-between gap-3">
          <AuthorCredit author={winner.author} messageUrl={winner.screenshot.messageUrl} />
          {winner.source === "inferred" && (
            // Not a warning, just provenance: this row was read back out of
            // the original announcement rather than written as it happened.
            <span
              className="shrink-0 font-mono text-[10px] text-white/30"
              title="Recuperada do anúncio original no Discord, não registada na altura."
            >
              arquivo
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
