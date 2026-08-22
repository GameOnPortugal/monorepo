/**
 * Shared loading/error/empty presentational bits — pulled out of M8.5's
 * Home.tsx so every page reuses the same pattern instead of re-implementing
 * it. M11 restyled them to the card system and gave the empty state a slot
 * for an action, since "an empty screen is an invitation to act" and most of
 * this site's empty states have exactly one useful next step.
 */

export function SkeletonRow({ tiles = 4, className }: { tiles?: number; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-3 sm:grid-cols-4"} aria-hidden>
      {Array.from({ length: tiles }, (_, i) => i).map((key) => (
        <div key={key} className="aspect-square animate-pulse rounded-xl border border-surface-border bg-surface" />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => i).map((key) => (
        <div key={key} className="h-14 animate-pulse rounded-xl border border-surface-border bg-surface" />
      ))}
    </div>
  );
}

export function ApiError({ what }: { what: string }) {
  // Accents are for fills/borders/icons, never text on black (plan 03
  // "Accessibility" — #EA3223 is marginal as text). The red carries the
  // "error" meaning via the border, not the letters.
  return (
    <p className="rounded-r-lg border-l-2 border-accent-red bg-surface/60 py-4 pl-4 text-sm text-white/80">
      Não foi possível carregar {what} de momento. Tenta novamente mais tarde.
    </p>
  );
}

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-border px-6 py-12 text-center">
      <p className="text-white/55">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
