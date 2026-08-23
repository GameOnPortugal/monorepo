/**
 * M10.8 — "🏆 Vencedora da semana".
 *
 * Rendered in the brand yellow (`--color-accent-yellow`) as a border and a
 * tint, never as body text on the dark surface — the palette rule from
 * `brand/README.md` and `src/lib/platforms.ts`. It deliberately does not use
 * one of the four platform accents as a fill: those four colours *mean*
 * platform (see `PlatformBadge`), and a winner badge borrowing one would
 * quietly say something untrue about the console it was captured on.
 *
 * The vote count is shown only when there is one. The old bot's
 * announcements never stated a count, so ~all of the recovered history has
 * none — printing "0 votos" for a week somebody genuinely won would be a
 * fabrication, and the database stores null precisely to avoid it.
 */
export function WinnerBadge({
  voteCount,
  weekLabel,
  size = "sm",
}: {
  voteCount?: number | null;
  /** e.g. "5–11 jan 2026". Omitted in the gallery, where the tile has no room. */
  weekLabel?: string;
  size?: "sm" | "md";
}) {
  const sizing = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";

  const detail = [weekLabel, voteCount != null ? `${voteCount} votos` : null].filter(Boolean).join(" · ");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-mono font-semibold tracking-wide whitespace-nowrap ${sizing}`}
      style={{
        borderColor: "var(--color-accent-yellow)",
        color: "var(--color-accent-yellow)",
        backgroundColor: "color-mix(in oklab, var(--color-accent-yellow) 12%, transparent)",
      }}
    >
      <span aria-hidden>🏆</span>
      Vencedora{detail && <span className="font-normal opacity-80">· {detail}</span>}
    </span>
  );
}
