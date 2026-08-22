import { Link } from "react-router-dom";

/**
 * The masthead every list page shares (M11), so Mercado, Screenshots and Hall
 * of Fame read as three rooms in one building rather than three pages that
 * happen to share a header.
 *
 * `stats` is the page's own headline numbers — the thing that used to live
 * only on the Home stats bar, now repeated where it is actually relevant.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  stats,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats?: Array<{ label: string; value: string; accent?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-surface-border">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-8">
        <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-accent-mint uppercase">
          <span aria-hidden className="h-px w-8 bg-accent-mint" />
          {eyebrow}
        </p>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-5xl font-extrabold uppercase sm:text-6xl">{title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55">{description}</p>
          </div>

          {stats && stats.length > 0 && (
            <dl className="flex gap-8">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dd
                    className="tabular font-display text-3xl leading-none font-extrabold"
                    style={{ color: stat.accent }}
                  >
                    {stat.value}
                  </dd>
                  <dt className="mt-2 font-mono text-[10px] tracking-[0.15em] text-white/40 uppercase">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          )}
        </div>

        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

/** A quiet "here is where this actually happens" link, used under page headers. */
export function HelpLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="focus-glow inline-flex items-center gap-1.5 rounded font-mono text-xs text-accent-blue transition-colors hover:text-white"
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

/** Section heading for the Home preview sections. */
export function SectionHeader({
  title,
  count,
  href,
  linkLabel = "Ver tudo",
}: {
  title: string;
  count?: string;
  href: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end gap-4 border-b border-surface-border pb-4">
      <h2 className="font-display text-3xl font-extrabold uppercase sm:text-4xl">{title}</h2>
      {count && <span className="pb-1 font-mono text-[11px] text-white/35">{count}</span>}
      <Link
        to={href}
        className="focus-glow ml-auto rounded pb-1 font-mono text-[11px] tracking-[0.14em] text-accent-yellow uppercase transition-colors hover:text-white"
      >
        {linkLabel} →
      </Link>
    </div>
  );
}
