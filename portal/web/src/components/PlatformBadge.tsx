import { PLATFORMS, type Platform } from "../lib/platforms";

/**
 * The one component every future marketplace/gallery/leaderboard row reuses
 * for a platform tag. Text is always near-black on the accent fill — see
 * src/lib/platforms.ts for the AA contrast table that rules out white text.
 */
export function PlatformBadge({ platform }: { platform: Platform }) {
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
