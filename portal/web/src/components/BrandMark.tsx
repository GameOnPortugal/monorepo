/**
 * M10.1 — the community mark: the flaming gamepad-skull from the guild icon.
 *
 * Until now the portal never put the mark on screen anywhere. M8.1 vendored
 * the real artwork into `brand/` and derived it into `portal/web/public/` as
 * favicons and the OG card — both of which only ever appear *outside* the
 * page (a browser tab, a shared link). Every on-page brand appearance was the
 * *text* wordmark set in Archivo Black, so the site was correctly coloured,
 * correctly typeset, and never once showed the community's own logo.
 *
 * The two PNGs behind this component are derived from
 * `brand/guild-icon-1024.png` and have real transparency, unlike the source:
 * the guild icon is fully opaque white/accent line-art already composited
 * over #060302, which is exactly a premultiplied-over-near-black image, so
 * the alpha was recovered as each pixel's distance from that background and
 * the colour by un-premultiplying (max-channel rather than luminance, so the
 * four saturated face buttons stay fully opaque instead of being keyed to
 * half-transparent). See `brand/README.md` for the recipe.
 *
 * Transparency matters here rather than being tidiness: the mark has to sit
 * on `--color-surface` (#120D0A) in the image placeholder as well as on
 * `--color-background` (#060302) in the header, and an opaque #060302 crop
 * would show a visible dark square on the lighter card surface.
 *
 * Two assets, not one scaled asset, so a 28px header icon doesn't pull the
 * 105 KB hero file.
 *
 * Decorative by default: every place the mark appears it sits beside the
 * "GAME ON PORTUGAL" wordmark, which is already the accessible name — so a
 * second, redundant announcement would be noise to a screen reader. Pass an
 * explicit `alt` only where the mark stands alone.
 */
export function BrandMark({
  variant = "sm",
  className,
  alt,
}: {
  variant?: "sm" | "lg";
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={variant === "sm" ? "/brand/mark-64.png" : "/brand/mark-512.png"}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      // The mark is taller than it is wide (602×761 after cropping to the
      // artwork's bounding box — that is the logo's real proportion, not a
      // derivation mistake), so callers size by height and let width follow.
      className={`w-auto object-contain ${className ?? ""}`.trim()}
      draggable={false}
    />
  );
}
