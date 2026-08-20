/**
 * Shared loading/error/empty presentational bits — pulled out of M8.5's
 * Home.tsx skeleton (where they were originally private to that one page)
 * so M8.7/M8.8/M8.9 reuse the same pattern instead of re-implementing it
 * per page.
 */

export function SkeletonRow({ tiles = 4, className }: { tiles?: number; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-2 sm:grid-cols-4"} aria-hidden>
      {Array.from({ length: tiles }, (_, i) => i).map((key) => (
        <div key={key} className="chamfer aspect-square animate-pulse border border-surface-border bg-surface" />
      ))}
    </div>
  );
}

export function ApiError({ what }: { what: string }) {
  // Accents are for fills/borders/icons, never text on black (plan 03
  // "Accessibility" — #EA3223 is marginal as text). The red carries the
  // "error" meaning via the border, not the letters.
  return (
    <p className="border-l-2 border-accent-red pl-3 text-sm text-white/80">
      Não foi possível carregar {what} de momento. Tenta novamente mais tarde.
    </p>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="border border-dashed border-surface-border px-4 py-6 text-center text-white/50">{children}</p>;
}
