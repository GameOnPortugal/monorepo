import { useCallback, useRef } from "react";

/**
 * The pointer-tracking half of the holographic card (the other half is
 * `.holo-foil` in index.css).
 *
 * Writes two custom properties — `--mx`/`--my`, the pointer's position inside
 * the element as a percentage — and a matching 3D rotation. The foil's
 * highlight reads off the same two properties, so the sheen and the tilt stay
 * locked together and the card looks like a physical surface catching light
 * rather than a gradient that happens to move.
 *
 * Two guards, checked per event rather than once at mount so a mid-session
 * change (plugging in a mouse, toggling the OS motion setting) is respected:
 *
 *   - `(hover: hover)` — on a touch screen every "pointer move" is a drag, so
 *     tilting would fight the scroll. The card keeps `.holo-foil`'s static
 *     centred sheen instead of losing the effect entirely.
 *   - `prefers-reduced-motion` — no tilt at all. index.css already flattens
 *     the CSS transition, but without this the element would still be
 *     re-transformed on every pointer move, which is exactly the motion the
 *     user asked not to see.
 *
 * Inline styles rather than React state on purpose: this fires on every
 * pointer move, and re-rendering a card subtree at that rate is how a
 * scroll-janky page gets built.
 */
function canTilt(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(hover: hover)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDegrees = 14) {
  const ref = useRef<T | null>(null);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      const element = ref.current;
      if (!element || !canTilt()) return;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      element.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      element.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      element.style.transform =
        `rotateY(${((x - 0.5) * maxDegrees).toFixed(2)}deg) ` +
        `rotateX(${((0.5 - y) * maxDegrees).toFixed(2)}deg) translateZ(12px)`;
    },
    [maxDegrees],
  );

  const reset = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.transform = "";
    element.style.removeProperty("--mx");
    element.style.removeProperty("--my");
  }, []);

  return { ref, onPointerMove, onPointerLeave: reset, onBlur: reset };
}
