import { NavLink, Outlet } from "react-router-dom";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

const NAV_LINKS = [
  { to: "/marketplace", label: "Marketplace" },
  { to: "/screenshots", label: "Screenshots" },
  { to: "/trophies", label: "Troféus" },
];

// Mobile-first shell (375px baseline — docs/plans/03-portal.md "Mobile"):
// a slim sticky header that never competes with content, and a footer with
// the socials from docs/plans/00-overview.md. Desktop is a max-width
// container, not a different layout.
//
// M8.6-M8.9 nav added here (was just the wordmark + Discord CTA in M8.5's
// scaffold): a horizontally-scrollable link row so it doesn't wrap/crowd the
// 375px baseline, rather than a hamburger menu — three links is not enough
// to justify a drawer, and a drawer is one more thing to test in the
// Discord in-app browser (plan 03 "Mobile").
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <a href="/" className="shrink-0 font-display text-lg tracking-tight">
            GAME ON <span className="text-accent-yellow">PORTUGAL</span>
          </a>
          <nav className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto text-sm text-white/70">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `focus-glow shrink-0 whitespace-nowrap hover:text-white ${isActive ? "text-white" : ""}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            className="focus-glow chamfer shrink-0 bg-accent-blue px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Entrar no Discord
          </a>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-surface-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-white/60">
          <p>Game On Portugal — comunidade de jogadores portuguesa.</p>
          <nav className="flex flex-wrap gap-4">
            <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className="hover:text-white">
              Discord
            </a>
            <a href="https://t.me/gameonportugal" target="_blank" rel="noreferrer" className="hover:text-white">
              Telegram
            </a>
            <a
              href="https://facebook.com/gameonportugalofficial"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              Facebook
            </a>
            {/* M8.10 — discreet, not hidden: /admin is protected by Discord
                OAuth + ManageMessages either way (see pages/admin/AdminLayout.tsx),
                so linking it plainly is no less safe than a moderator having
                to know the URL, and it's one fewer thing to remember. */}
            <a href="/admin" className="hover:text-white">
              Admin
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
