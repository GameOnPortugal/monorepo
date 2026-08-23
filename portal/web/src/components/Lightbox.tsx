import { useEffect } from "react";
import { normalizePlatform } from "../lib/normalize";
import type { Author, ScreenshotWinnerBadge } from "../lib/api/client";
import { AuthorCredit } from "./AuthorCredit";
import { PlatformBadge } from "./PlatformBadge";
import { WinnerBadge } from "./WinnerBadge";

/**
 * Full-screen viewer for the screenshots gallery (M8.8) and the marketplace
 * detail gallery (M11).
 *
 * The item shape is structural rather than `Screenshot`, so an ad's image
 * array can be viewed with the same component instead of a second, nearly
 * identical overlay. `Screenshot` satisfies it as-is.
 *
 * Keyboard-navigable (Esc closes, arrows move) and closes on backdrop click.
 * No enter/exit transition — plan 03's "motion is functional only" plus the
 * global `prefers-reduced-motion` override already covers this, and a plain
 * instant show/hide needs no extra handling for reduced motion the way a
 * slide or fade would.
 *
 * Body scroll is locked while open: without it, arrow keys and the wheel
 * scroll the page behind the overlay, so closing it drops you somewhere else.
 */
export interface LightboxItem {
  id: string;
  name: string | null;
  imageUrl: string | null;
  platform?: string | null;
  createdAt?: string;
  // M10.5/M10.8 — optional, so an ad's image array (which has no author of
  // its own on the public shape yet) still satisfies this structurally.
  author?: Author | null;
  messageUrl?: string | null;
  winner?: ScreenshotWinnerBadge | null;
}

const DATE_FORMAT = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" });

export function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
}: {
  items: LightboxItem[];
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, items.length, onClose, onNavigate]);

  if (!current) return null;

  const platform = current.platform !== undefined ? normalizePlatform(current.platform) : null;
  const date = current.createdAt ? new Date(current.createdAt) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/96 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={current.name ?? "Imagem"}
    >
      <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
        <span className="tabular font-mono text-xs text-white/45">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="focus-glow rounded-lg border border-surface-border bg-surface/80 px-3 py-1.5 font-mono text-xs text-white/75 transition-colors hover:text-white"
        >
          Fechar ✕
        </button>
      </div>

      <div className="flex max-h-full max-w-5xl flex-col items-center gap-4" onClick={(event) => event.stopPropagation()}>
        {current.imageUrl ? (
          <img
            src={current.imageUrl}
            alt={current.name ?? "Imagem"}
            className="max-h-[76vh] max-w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-64 w-full items-center justify-center rounded-lg bg-surface text-white/40">
            Sem imagem
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          {current.name && <span className="font-semibold">{current.name}</span>}
          {platform && <PlatformBadge platform={platform} />}
          {date && <span className="font-mono text-xs text-white/40">{DATE_FORMAT.format(date)}</span>}
          {current.winner && <WinnerBadge voteCount={current.winner.voteCount} size="md" />}
        </div>

        {current.author && (
          <div className="flex items-center justify-center">
            <AuthorCredit author={current.author} messageUrl={current.messageUrl} size="md" />
          </div>
        )}
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate((index - 1 + items.length) % items.length);
            }}
            className="focus-glow absolute top-1/2 left-2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface/70 px-3 py-4 text-lg text-white/75 transition-colors hover:text-white sm:left-6"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate((index + 1) % items.length);
            }}
            className="focus-glow absolute top-1/2 right-2 -translate-y-1/2 rounded-lg border border-surface-border bg-surface/70 px-3 py-4 text-lg text-white/75 transition-colors hover:text-white sm:right-6"
            aria-label="Seguinte"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
