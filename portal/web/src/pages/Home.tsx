import { useEffect, useState } from "react";
import { type Ad, api, type LeaderboardEntry, type Screenshot } from "../lib/api/client";
import { guessPlatform } from "../lib/platforms";
import { PlatformBadge } from "../components/PlatformBadge";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/**
 * The one representative page built in this scaffold (M8.5's acceptance
 * criteria: "a routing, token layer and one representative page so the next
 * agent has a pattern to follow, not a blank canvas"). Home itself (hero,
 * live stats, latest content, Discord CTA) is M8.6 — this is a working
 * skeleton of it, not the finished page.
 *
 * Pattern demonstrated here for M8.7-M8.9 to copy: a typed `api.*` call,
 * loading/error/empty states, mobile-first layout (375px column, no grid
 * until a wider viewport), and PlatformBadge for platform tags.
 */
export function Home() {
  return (
    <div>
      <Hero />
      <Section title="Últimos anúncios">
        <AdsStrip />
      </Section>
      <Section title="Últimas screenshots">
        <ScreenshotsStrip />
      </Section>
      <Section title="Hall of Fame — Trophy leaderboard">
        <Leaderboard />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h2 className="font-display text-xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

type LoadState = "loading" | "error" | "empty" | "ready";

function AdsStrip() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    api
      .listAds(6)
      .then(({ ads }) => {
        if (cancelled) return;
        setAds(ads);
        setState(ads.length > 0 ? "ready" : "empty");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return <SkeletonRow />;
  if (state === "error") return <ApiError what="os anúncios" />;
  if (state === "empty") return <p className="text-white/50">Sem anúncios ativos neste momento.</p>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {ads.map((ad) => (
        <article key={ad.id} className="chamfer border border-surface-border bg-surface p-4">
          <h3 className="font-semibold">{ad.name ?? "Anúncio sem título"}</h3>
          <p className="mt-1 text-sm text-white/60">{ad.price ?? "Preço não indicado"}</p>
          {guessPlatform(ad.state) && (
            <div className="mt-2">
              <PlatformBadge platform={guessPlatform(ad.state)!} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function ScreenshotsStrip() {
  const [items, setItems] = useState<Screenshot[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    api
      .listScreenshots(8)
      .then(({ screenshots }) => {
        if (cancelled) return;
        setItems(screenshots);
        setState(screenshots.length > 0 ? "ready" : "empty");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return <SkeletonRow />;
  if (state === "error") return <ApiError what="as screenshots" />;
  if (state === "empty") return <p className="text-white/50">Ainda sem screenshots publicadas.</p>;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((shot) => (
        <div key={shot.id} className="chamfer aspect-square overflow-hidden border border-surface-border bg-surface">
          {shot.imageUrl ? (
            <img src={shot.imageUrl} alt={shot.name ?? "Screenshot"} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-white/40">Sem imagem</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    api
      .leaderboard(10)
      .then(({ leaderboard }) => {
        if (cancelled) return;
        setEntries(leaderboard);
        setState(leaderboard.length > 0 ? "ready" : "empty");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return <SkeletonRow />;
  if (state === "error") return <ApiError what="o leaderboard" />;
  if (state === "empty") return <p className="text-white/50">Sem troféus registados.</p>;

  return (
    <ol className="divide-y divide-surface-border border border-surface-border">
      {entries.map((entry) => (
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

function SkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden>
      {["a", "b", "c", "d"].map((key) => (
        <div key={key} className="chamfer aspect-square animate-pulse border border-surface-border bg-surface" />
      ))}
    </div>
  );
}

function ApiError({ what }: { what: string }) {
  // Accents are for fills/borders/icons, never text on black (plan 03
  // "Accessibility" — #EA3223 is marginal as text). The red carries the
  // "error" meaning via the border, not the letters.
  return (
    <p className="border-l-2 border-accent-red pl-3 text-sm text-white/80">
      Não foi possível carregar {what} de momento. Tenta novamente mais tarde.
    </p>
  );
}
