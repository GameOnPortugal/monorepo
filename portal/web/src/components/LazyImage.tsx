import { useEffect, useRef, useState } from "react";

/**
 * M8.8's request-count half of "a phone must not download a 4 MB PNG per
 * grid tile": never mount an `<img>` until it is about to enter the
 * viewport, so a 600-tile gallery does not fire 600 simultaneous requests —
 * only tiles near the visible area ever download at all.
 *
 * This is complementary to, not a replacement for, the bytes-per-image half:
 * `portal/api/src/routes/media.ts`'s resize-and-cache endpoint (see that
 * file and `lib/thumbnails.ts`), which `Screenshots.tsx`'s grid tiles now
 * request via `thumbnailUrl()` instead of the full-size origin image. This
 * component doesn't know or care whether `src` points at a thumbnail or a
 * full image — it stays a plain, reusable "don't mount until near the
 * viewport" wrapper, used for full-size images too (`AdCard`'s listing
 * photo, the marketplace detail gallery).
 *
 * Also handles the two known-dead 2022 Discord CDN links (docs say 622/624
 * screenshots were re-hosted to MinIO, 2 are dead) — and any future broken
 * URL, including a thumbnail request the API had to refuse — by swapping to
 * a placeholder on `onError` instead of leaving a broken-image icon in the
 * grid.
 */
export function LazyImage({
  src,
  alt,
  className,
  onClick,
}: {
  src: string | null;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  const showPlaceholder = !src || broken || !inView;

  return (
    <div
      ref={ref}
      onClick={onClick}
      // Keyboard-operable when clickable (gallery tiles, MarketplaceDetail's
      // thumbnail strip) — a `<div onClick>` with no role/tabIndex/keydown is
      // a mouse-only control, which fails the task brief's "accessibility is
      // a requirement" bar as much as a contrast miss would.
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? alt : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`${className ?? ""} ${onClick ? "focus-glow cursor-pointer" : ""}`.trim()}
    >
      {showPlaceholder ? (
        <div className="flex h-full w-full items-center justify-center bg-surface text-xs text-white/40">
          {!src || broken ? "Sem imagem" : ""}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
