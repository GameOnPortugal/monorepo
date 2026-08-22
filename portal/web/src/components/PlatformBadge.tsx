import type { PlatformTag } from "../lib/normalize";
import { PLATFORMS } from "../lib/platforms";

/**
 * The one component every marketplace/gallery/leaderboard row reuses for a
 * platform tag. Text is always near-black on the accent fill — see
 * src/lib/platforms.ts for the AA contrast table that rules out white text on
 * every one of the four accents.
 *
 * Also accepts `normalizePlatform()`'s residual `"other"` bucket (M8.4) —
 * deliberately rendered *without* one of the four brand accents (plan 03:
 * "the four button colours are the platform palette", i.e. they mean
 * something specific; a fifth, made-up colour for "everything else" would
 * dilute that). It gets a plain muted outline instead.
 */
export function PlatformBadge({ platform, size = "sm" }: { platform: PlatformTag; size?: "sm" | "md" }) {
  const sizing = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";

  if (platform === "other") {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-surface-border font-mono tracking-wide text-white/60 ${sizing}`}
      >
        Outra
      </span>
    );
  }

  const meta = PLATFORMS[platform];

  return (
    <span
      className={`inline-flex items-center rounded-md font-mono font-semibold tracking-wide text-background ${sizing}`}
      style={{ backgroundColor: meta.colorVar }}
    >
      {meta.label}
    </span>
  );
}
