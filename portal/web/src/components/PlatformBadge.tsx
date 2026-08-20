import { PLATFORMS } from "../lib/platforms";
import type { PlatformTag } from "../lib/normalize";

/**
 * The one component every future marketplace/gallery/leaderboard row reuses
 * for a platform tag. Text is always near-black on the accent fill — see
 * src/lib/platforms.ts for the AA contrast table that rules out white text.
 *
 * Also accepts `normalizePlatform()`'s residual `"other"` bucket (M8.4) —
 * deliberately rendered *without* one of the four brand accents (plan 03:
 * "the four button colours are the platform palette", i.e. they mean
 * something specific; a fifth, made-up colour for "everything else" would
 * dilute that). It gets a plain muted outline instead.
 */
export function PlatformBadge({ platform }: { platform: PlatformTag }) {
  if (platform === "other") {
    return (
      <span className="chamfer inline-flex items-center border border-surface-border px-2 py-0.5 text-xs font-semibold text-white/70">
        Outra plataforma
      </span>
    );
  }

  const meta = PLATFORMS[platform];

  return (
    <span
      className="chamfer inline-flex items-center px-2 py-0.5 text-xs font-semibold text-background"
      style={{ backgroundColor: meta.colorVar }}
    >
      {meta.label}
    </span>
  );
}
