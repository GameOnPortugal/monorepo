import { Link } from "react-router-dom";
import { AdCard } from "../components/AdCard";
import { BrandMark } from "../components/BrandMark";
import { HoloCard } from "../components/HoloCard";
import { LazyImage } from "../components/LazyImage";
import { PlayerCard } from "../components/PlayerCard";
import { SectionHeader } from "../components/PageHeader";
import { ApiError, EmptyState, SkeletonRow } from "../components/StateViews";
import { api, thumbnailUrl } from "../lib/api/client";
import { useDocumentHead } from "../lib/seo";
import { useApi } from "../lib/useApi";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/**
 * Home. The hero is the thesis: the community's own mark on a foiled
 * collectible card numbered Nº 001, carrying the three live totals. That card
 * is the site's signature (see components/HoloCard.tsx) and it is the reason
 * the rest of the site can be quiet — every other surface is a plain card.
 *
 * Below it, three previews, each linking to a page that now does far more
 * than the preview can (filters, search, detail views) —
 * rather than the old layout, where Home showed roughly what the sub-pages
 * showed and the sub-pages had little reason to exist.
 *
 * Every strip still has to look right when the newest content is months old
 * (the screenshot set has been static since 2026-06-01) — the empty and error
 * states below say so plainly instead of rendering an empty grid.
 */
export function Home() {
  useDocumentHead({
    title: "Game On Portugal",
    description:
      "Marketplace, screenshots e leaderboard de troféus da comunidade de jogadores portuguesa no Discord.",
    path: "/",
  });

  return (
    <div>
      <Hero />
      <div className="mx-auto max-w-6xl space-y-16 px-4 py-16">
        <section>
          <SectionHeader title="Hall of Fame" href="/trophies" linkLabel="Ver ranking" />
          <div className="mt-6">
            <PodiumPreview />
          </div>
        </section>

        <section>
          <SectionHeader title="Mercado" href="/marketplace" />
          <div className="mt-6">
            <AdsPreview />
          </div>
        </section>

        <section>
          <SectionHeader title="Screenshots" href="/screenshots" />
          <div className="mt-6">
            <ScreenshotsPreview />
          </div>
        </section>
      </div>
    </div>
  );
}

function Hero() {
  const { state, data } = useApi(() => api.stats(), [], () => false);

  const value = (n: number | undefined) => (state === "error" ? "—" : (n?.toLocaleString("pt-PT") ?? "···"));

  return (
    <section className="relative overflow-hidden border-b border-surface-border">
      {/* Ambient only: a soft brand-coloured wash behind the card, masked so
          it never reaches the text column and reduces contrast there. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25 blur-[120px]"
        style={{
          background:
            "radial-gradient(40% 50% at 78% 30%, var(--color-accent-blue), transparent 70%)," +
            "radial-gradient(35% 45% at 88% 75%, var(--color-accent-mint), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1fr_380px] lg:py-24">
        <div className="rise">
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-accent-mint uppercase">
            <span aria-hidden className="h-px w-8 bg-accent-mint" />
            Comunidade portuguesa · desde 2021
          </p>

          <h1 className="mt-6 font-display text-6xl leading-[0.86] font-extrabold uppercase sm:text-8xl">
            Joga.
            <span className="mt-1 block text-transparent [-webkit-text-stroke:1.5px_var(--color-accent-yellow)]">
              Colecciona.
            </span>
          </h1>

          <p className="mt-6 max-w-md leading-relaxed text-white/60">
            Cada caçador de troféus tem a sua carta. Cada anúncio, cada screenshot e cada platina da comunidade fica
            registada aqui — puxada em direto do Discord.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer"
              className="focus-glow chamfer bg-accent-yellow px-6 py-3.5 font-bold text-background transition-transform hover:-translate-y-0.5"
            >
              Entrar no Discord
            </a>
            <Link
              to="/trophies"
              className="focus-glow rounded border-b border-white/25 pb-1 text-sm font-semibold text-white/70 transition-colors hover:border-white hover:text-white"
            >
              Ver o Hall of Fame
            </Link>
          </div>
        </div>

        <div className="rise mx-auto w-full max-w-[340px] lg:max-w-none">
          <HoloCard>
            <div className="flex items-start justify-between">
              <span className="rounded border border-accent-yellow/40 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-accent-yellow">
                GUILD · LENDÁRIA
              </span>
              <span className="text-right font-mono text-[9px] leading-relaxed text-white/40">
                Nº 001
                <br />
                2021 — ∞
              </span>
            </div>

            <div className="grid min-h-0 flex-1 place-items-center py-4">
              <BrandMark
                variant="lg"
                className="float max-h-full w-auto max-w-[60%] drop-shadow-[0_0_26px_rgba(255,255,255,0.34)]"
              />
            </div>

            <h2 className="font-display text-4xl leading-[0.86] font-extrabold uppercase">
              Game <span className="text-accent-yellow">On</span>
              <br />
              Portugal
            </h2>
            <p className="mt-2 font-mono text-[9px] tracking-[0.19em] text-white/50">
              PC · PLAYSTATION · XBOX · NINTENDO
            </p>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3.5 text-center">
              <div>
                <dd className="tabular font-display text-2xl leading-none font-extrabold text-accent-yellow">
                  {value(data?.trophies)}
                </dd>
                <dt className="mt-1.5 font-mono text-[8px] tracking-[0.12em] text-white/45">TROFÉUS</dt>
              </div>
              <div>
                <dd className="tabular font-display text-2xl leading-none font-extrabold text-accent-mint">
                  {value(data?.screenshots)}
                </dd>
                <dt className="mt-1.5 font-mono text-[8px] tracking-[0.12em] text-white/45">SHOTS</dt>
              </div>
              <div>
                <dd className="tabular font-display text-2xl leading-none font-extrabold text-accent-blue">
                  {value(data?.hunters)}
                </dd>
                <dt className="mt-1.5 font-mono text-[8px] tracking-[0.12em] text-white/45">CAÇADORES</dt>
              </div>
            </dl>
          </HoloCard>

          <p className="mt-4 text-center font-mono text-[10px] tracking-[0.16em] text-white/25 uppercase">
            Move o rato sobre a carta
          </p>
        </div>
      </div>
    </section>
  );
}

function PodiumPreview() {
  const { state, data } = useApi(
    () => api.leaderboard(3),
    [],
    (value) => value.leaderboard.length === 0,
  );

  if (state === "loading") return <SkeletonRow tiles={3} className="grid grid-cols-1 gap-4 sm:grid-cols-3" />;
  if (state === "error") return <ApiError what="o ranking" />;
  if (state === "empty") return <EmptyState>Sem troféus registados ainda.</EmptyState>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {data!.leaderboard.map((entry) => (
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
  );
}

function AdsPreview() {
  const { state, data } = useApi(
    () => api.listAds(8),
    [],
    (value) => value.ads.length === 0,
  );

  if (state === "loading")
    return <SkeletonRow tiles={4} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" />;
  if (state === "error") return <ApiError what="os anúncios" />;
  if (state === "empty")
    return (
      <EmptyState
        action={
          <Link to="/como-participar#marketplace" className="focus-glow chamfer bg-accent-blue px-5 py-2.5 text-sm font-bold text-background">
            Como publicar um anúncio
          </Link>
        }
      >
        Sem anúncios ativos neste momento — o mercado está sossegado.
      </EmptyState>
    );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {data!.ads.slice(0, 4).map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

function ScreenshotsPreview() {
  const { state, data } = useApi(
    () => api.listScreenshots(10),
    [],
    (value) => value.screenshots.length === 0,
  );

  if (state === "loading")
    return <SkeletonRow tiles={5} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" />;
  if (state === "error") return <ApiError what="as screenshots" />;
  if (state === "empty")
    return <EmptyState>Ainda sem screenshots publicadas. Sê o primeiro a partilhar uma!</EmptyState>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {data!.screenshots.slice(0, 5).map((shot) => (
        <Link
          key={shot.id}
          to="/screenshots"
          className="focus-glow group relative block overflow-hidden rounded-xl border border-surface-border"
        >
          <LazyImage
            src={thumbnailUrl(shot.imageUrl, 320)}
            alt={shot.name ?? "Screenshot"}
            className="aspect-[4/3] w-full overflow-hidden bg-surface transition-transform duration-500 group-hover:scale-[1.07]"
          />
          {shot.name && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent px-3 pt-8 pb-2.5 text-xs font-medium">
              <span className="line-clamp-1">{shot.name}</span>
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
