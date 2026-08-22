import { useTilt } from "../lib/useTilt";

/**
 * The redesign's signature element: a collectible-card surface that leans
 * toward the pointer while a holographic foil tracks the same position.
 *
 * Used sparingly and on purpose — the guild card in the hero and the three
 * podium hunters. Everything else on the site is a plain card with at most a
 * `.shine` sweep. One memorable thing, executed properly, beats the effect
 * being sprayed over every tile until it reads as noise.
 *
 * Structure matters for the foil to composite correctly:
 *   - the outer element owns `perspective`, so the tilt has depth
 *   - the card owns `.holo-foil`, whose ::before/::after sit at z-index 2-3
 *   - content is z-index 4, above the foil, so text never gets colour-dodged
 *     into illegibility
 *
 * Degrades in the right direction: with no pointer, no JS or reduced motion
 * the card keeps a static centred sheen (see `.holo-foil`'s defaults) instead
 * of losing its identity.
 */
export function HoloCard({
  children,
  className,
  ratio = "aspect-[63/88]",
}: {
  children: React.ReactNode;
  className?: string;
  /** Trading-card proportions by default; podium cards override it. */
  ratio?: string;
}) {
  const tilt = useTilt<HTMLDivElement>();

  return (
    <div className="[perspective:1100px]">
      <div
        ref={tilt.ref}
        onPointerMove={tilt.onPointerMove}
        onPointerLeave={tilt.onPointerLeave}
        className={`holo-foil relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#1b1410] via-[#080504] to-[#141b1e] shadow-[0_26px_60px_-18px_rgba(0,0,0,0.9)] transition-transform duration-200 ease-out [transform-style:preserve-3d] ${ratio} ${className ?? ""}`}
      >
        <div className="relative z-[4] flex h-full flex-col p-5">{children}</div>
      </div>
    </div>
  );
}
