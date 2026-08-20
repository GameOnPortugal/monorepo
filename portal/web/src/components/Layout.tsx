import { Outlet } from "react-router-dom";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

// Mobile-first shell (375px baseline — docs/plans/03-portal.md "Mobile"):
// a slim sticky header that never competes with content, and a footer with
// the socials from docs/plans/00-overview.md. Desktop is a max-width
// container, not a different layout.
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a href="/" className="font-display text-lg tracking-tight">
            GAME ON <span className="text-accent-yellow">PORTUGAL</span>
          </a>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            className="focus-glow chamfer bg-accent-blue px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
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
          </nav>
        </div>
      </footer>
    </div>
  );
}
