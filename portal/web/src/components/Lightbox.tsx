import { useEffect } from "react";
import type { Screenshot } from "../lib/api/client";
import { normalizePlatform } from "../lib/normalize";
import { PlatformBadge } from "./PlatformBadge";

/**
 * Full-screen viewer for the screenshots gallery (M8.8). Keyboard-navigable
 * (Esc closes, arrow keys move) and closes on backdrop click. No transition
 * animation — plan 03's "motion is functional only" plus the global
 * `prefers-reduced-motion` override in index.css already covers this: a
 * plain instant show/hide needs no extra handling for reduced motion,
 * unlike a slide/fade would.
 */
export function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
}: {
  items: Screenshot[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const current = items[index];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onNavigate((index + 1) % items.length);
      if (event.key === "ArrowLeft") onNavigate((index - 1 + items.length) % items.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, items.length, onClose, onNavigate]);

  if (!current) return null;
  const platform = normalizePlatform(current.platform);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <button
        type="button"
        onClick={onClose}
        className="focus-glow absolute top-4 right-4 chamfer border border-surface-border px-3 py-1.5 text-sm text-white/80 hover:text-white"
        aria-label="Fechar"
      >
        Fechar ✕
      </button>

      <div className="flex max-h-full max-w-4xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {current.imageUrl ? (
          <img
            src={current.imageUrl}
            alt={current.name ?? "Screenshot"}
            className="max-h-[75vh] max-w-full object-contain"
          />
        ) : (
          <div className="flex h-64 w-full items-center justify-center bg-surface text-white/40">Sem imagem</div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/70">
          {current.name && <span>{current.name}</span>}
          {platform && <PlatformBadge platform={platform} />}
        </div>
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index - 1 + items.length) % items.length);
            }}
            className="focus-glow absolute left-2 top-1/2 -translate-y-1/2 chamfer border border-surface-border bg-background/60 px-3 py-4 text-lg text-white/80 hover:text-white sm:left-6"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate((index + 1) % items.length);
            }}
            className="focus-glow absolute right-2 top-1/2 -translate-y-1/2 chamfer border border-surface-border bg-background/60 px-3 py-4 text-lg text-white/80 hover:text-white sm:right-6"
            aria-label="Seguinte"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
