import { Link } from "react-router-dom";
import { monogram, monogramColor } from "../lib/psn";
import { HoloCard } from "./HoloCard";

/**
 * A trophy hunter, as a collectible card.
 *
 * Two forms of the same information, so a leaderboard can lead with a podium
 * without inventing a second visual language for it:
 *   - `featured` — the top three, on the full holo surface
 *   - default — everyone else, a plain card with a shine sweep
 *
 * Rank colour is metal, not brand accent (`--color-rank-silver/bronze` plus
 * the brand yellow for first). Deliberate: `src/lib/platforms.ts` reserves
 * the four face-button colours to mean *platform*, and since every hunter
 * here is a PSN profile, colouring podium places with them would both flatten
 * the palette and imply something untrue.
 */
const RANK_COLOR: Record<number, string> = {
  1: "var(--color-accent-yellow)",
  2: "var(--color-rank-silver)",
  3: "var(--color-rank-bronze)",
};

function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg font-display font-extrabold text-background ${className ?? "h-9 w-9 text-lg"}`}
      style={{ backgroundColor: monogramColor(name) }}
    >
      {monogram(name)}
    </span>
  );
}

export function PlayerCard({
  rank,
  psnProfile,
  points,
  trophyCount,
  featured = false,
}: {
  rank: number;
  psnProfile: string | null;
  points: number;
  trophyCount: number;
  featured?: boolean;
}) {
  // A profile with no name can still hold a rank, but it has nothing to link
  // to and no monogram to draw — it renders as a plain, unlinked card.
  const name = psnProfile ?? null;
  const rankColor = RANK_COLOR[rank];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className="tabular font-display text-5xl leading-none font-extrabold"
          style={{ color: rankColor ?? "rgb(255 255 255 / 0.25)" }}
        >
          {String(rank).padStart(2, "0")}
        </span>
        {name && !featured && <Monogram name={name} />}
      </div>

      {/* On the podium the monogram is the card's art, centred in the space a
          trading card gives its illustration — without it the tall format
          leaves a void between the rank and the name. */}
      {featured && name && (
        <div className="grid min-h-0 flex-1 place-items-center py-4">
          <Monogram name={name} className="h-20 w-20 rounded-2xl text-4xl shadow-lg" />
        </div>
      )}

      <div className={featured ? "mt-auto" : "mt-4"}>
        <p className="truncate text-[15px] font-bold" title={name ?? undefined}>
          {name ?? "Perfil sem nome"}
        </p>
        <p className="mt-1 font-mono text-[10px] tracking-[0.13em] text-white/45 uppercase">
          {trophyCount.toLocaleString("pt-PT")} platinas
        </p>
        <p className="tabular mt-4 border-t border-surface-border pt-3 font-display text-3xl font-extrabold">
          {points.toLocaleString("pt-PT")}
          <span className="ml-1.5 font-mono text-[10px] font-normal tracking-[0.13em] text-white/45">PTS</span>
        </p>
      </div>
    </>
  );

  const card = featured ? (
    <HoloCard ratio="aspect-[63/78]">{body}</HoloCard>
  ) : (
    <div className="shine h-full rounded-xl border border-surface-border bg-gradient-to-br from-white/[0.055] to-white/[0.012] p-4 transition-transform duration-200 hover:-translate-y-1.5">
      {body}
    </div>
  );

  if (!name) return card;

  return (
    <Link
      to={`/trophies/${encodeURIComponent(name)}`}
      className="focus-glow block rounded-xl"
      aria-label={`${name} — rank ${rank}, ${points.toLocaleString("pt-PT")} pontos`}
    >
      {card}
    </Link>
  );
}

export { Monogram };
