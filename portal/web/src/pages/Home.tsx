import { Link } from "react-router-dom";
import { AdCard } from "../components/AdCard";
import { LazyImage } from "../components/LazyImage";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { api } from "../lib/api/client";
import { useApi } from "../lib/useApi";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/**
 * M8.6 — Home. Builds on M8.5's skeleton (hero + three data strips) with:
 * live stats (new `/api/stats`, M8.6's own addition — see
 * portal/api/src/repositories/stats.ts for why there's no member count),
 * real navigation into the M8.7/M8.8/M8.9 pages instead of dead-end strips,
 * and the AdCard/LazyImage components those pages also use.
 *
 * The "latest screenshots" section has to look right when the newest
 * content is months old (task brief: newest screenshot is 2026-06-01, 90
 * days stale) — it does not pretend otherwise; see `ScreenshotsStrip`'s
 * `EmptyState` copy and the honest date-relative note below the stats bar.
 */
export function Home() {
  return (
    <div>
      <Hero />
      <StatsBar />
      <Section title="Últimos anúncios" viewAllHref="/marketplace">
        <AdsStrip />
      </Section>
      <Section title="Últimas screenshots" viewAllHref="/screenshots">
        <ScreenshotsStrip />
      </Section>
      <Section title="Hall of Fame — Trophy leaderboard" viewAllHref="/trophies">
        <LeaderboardPreview />
      </Section>
    </div>
  );
}

function Hero() {
  return (
    <section className="scanlines relative overflow-hidden border-b border-surface-border px-4 py-16 text-center sm:py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-white/50 uppercase">Discord community</p>
      <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-tight sm:text-6xl">
        GAME ON <span className="text-accent-yellow">PORTUGAL</span>
      </h1>
      <p className="mx-auto mt-4 max-w-md text-white/70">
        Marketplace, screenshots e leaderboard de troféus da maior comunidade de jogadores portuguesa.
      </p>
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer"
        className="focus-glow chamfer mt-8 inline-block bg-accent-blue px-6 py-3 font-semibold text-background transition-opacity hover:opacity-90"
      >
        Entrar no Discord
      </a>
    </section>
  );
}

function StatsBar() {
  const { state, data } = useApi(() => api.stats(), [], () => false);

  const tiles: Array<{ label: string; value: number | null }> = [
    { label: "Anúncios ativos", value: data?.activeAds ?? null },
    { label: "Screenshots", value: data?.screenshots ?? null },
    { label: "Troféus", value: data?.trophies ?? null },
    { label: "Trophy hunters", value: data?.hunters ?? null },
  ];

  return (
    <section className="border-b border-surface-border">
      <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-surface-border border-x border-surface-border sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="px-4 py-5 text-center">
            <div className="font-display text-2xl text-accent-mint sm:text-3xl">
              {state === "error" ? "—" : (tile.value?.toLocaleString("pt-PT") ?? "···")}
            </div>
            <div className="mt-1 text-xs text-white/60">{tile.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({
  title,
  viewAllHref,
  children,
}: {
  title: string;
  viewAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl">{title}</h2>
        <Link to={viewAllHref} className="focus-glow text-sm text-accent-blue hover:underline">
          Ver tudo →
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function AdsStrip() {
  const { state, data } = useApi(
    () => api.listAds(6),
    [],
    (value) => value.ads.length === 0,
  );

  if (state === "loading") return <SkeletonRow className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3" tiles={3} />;
  if (state === "error") return <ApiError what="os anúncios" />;
  if (state === "empty") return <EmptyState>Sem anúncios ativos neste momento — o marketplace está sossegado.</EmptyState>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {data!.ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

function ScreenshotsStrip() {
  const { state, data } = useApi(
    () => api.listScreenshots(8),
    [],
    (value) => value.screenshots.length === 0,
  );

  if (state === "loading") return <SkeletonRow />;
  if (state === "error") return <ApiError what="as screenshots" />;
  if (state === "empty") return <EmptyState>Ainda sem screenshots publicadas. Sê o primeiro a partilhar uma!</EmptyState>;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {data!.screenshots.map((shot) => (
        <Link key={shot.id} to="/screenshots" className="block">
          <LazyImage
            src={shot.imageUrl}
            alt={shot.name ?? "Screenshot"}
            className="chamfer aspect-square overflow-hidden border border-surface-border bg-surface"
          />
        </Link>
      ))}
    </div>
  );
}

function LeaderboardPreview() {
  const { state, data } = useApi(
    () => api.leaderboard(10),
    [],
    (value) => value.leaderboard.length === 0,
  );

  if (state === "loading") return <SkeletonRow />;
  if (state === "error") return <ApiError what="o leaderboard" />;
  if (state === "empty") return <EmptyState>Sem troféus registados.</EmptyState>;

  return (
    <ol className="divide-y divide-surface-border border border-surface-border">
      {data!.leaderboard.map((entry) => (
        <li key={entry.rank} className="flex items-center justify-between px-4 py-2">
          <span className="flex items-center gap-3">
            <span className="w-6 text-right font-display text-accent-mint">{entry.rank}</span>
            <span>{entry.psnProfile ?? "Perfil sem nome"}</span>
          </span>
          <span className="text-sm text-white/60">
            {entry.points.toLocaleString("pt-PT")} pts · {entry.trophyCount}
          </span>
        </li>
      ))}
    </ol>
  );
}
