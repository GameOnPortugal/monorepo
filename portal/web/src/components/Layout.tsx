import { Link, NavLink, Outlet } from "react-router-dom";
import { BrandMark } from "./BrandMark";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

const NAV_LINKS = [
  { to: "/marketplace", label: "Mercado" },
  { to: "/screenshots", label: "Screenshots" },
  { to: "/trophies", label: "Hall of Fame" },
  { to: "/como-participar", label: "Como participar" },
];

const SOCIALS = [
  { href: DISCORD_INVITE, label: "Discord" },
  { href: "https://t.me/gameonportugal", label: "Telegram" },
  { href: "https://facebook.com/gameonportugalofficial", label: "Facebook" },
];

/**
 * Mobile-first shell (375px baseline — docs/plans/03-portal.md "Mobile"): a
 * slim sticky header that never competes with content, and a footer with the
 * socials from docs/plans/00-overview.md. Desktop is a max-width container,
 * not a different layout.
 *
 * The nav stays a horizontally-scrollable link row rather than becoming a
 * hamburger drawer — four links is not enough to justify one, and a drawer is
 * one more thing to test in the Discord in-app browser this site is mostly
 * opened from (plan 03 "Mobile").
 *
 * M10.1's mark-plus-text lockup is kept exactly as it was: the wordmark stays
 * real text, because it is the accessible name and it stays crisp at every
 * zoom level. M11 only changes how that text is set — "GAME ON" in the brush
 * wordmark face over "PORTUGAL" in mono, echoing the lockup in
 * brand/logo-lockup-2048.png.
 */
export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="focus-glow sr-only rounded-lg bg-accent-yellow px-4 py-2 font-semibold text-background focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Saltar para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-surface-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-8">
          <a href="/" className="focus-glow flex shrink-0 items-center gap-2.5 rounded-lg">
            <BrandMark className="h-9" />
            <span className="leading-none">
              <span className="block font-wordmark text-base tracking-tight">GAME ON</span>
              <span className="mt-1 block font-mono text-[9px] tracking-[0.3em] text-accent-mint">PORTUGAL</span>
            </span>
          </a>

          <nav
            aria-label="Principal"
            className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto text-sm whitespace-nowrap"
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `focus-glow shrink-0 rounded font-medium transition-colors ${
                    isActive ? "text-white" : "text-white/55 hover:text-white"
                  }`
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
            className="focus-glow chamfer hidden shrink-0 bg-accent-yellow px-4 py-2.5 text-sm font-bold text-background transition-transform hover:-translate-y-0.5 sm:block"
          >
            Entrar no Discord
          </a>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-surface-border">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark className="h-8 opacity-70" />
                <span className="leading-none">
                  <span className="block font-wordmark text-sm tracking-tight">GAME ON</span>
                  <span className="mt-1 block font-mono text-[8px] tracking-[0.3em] text-white/40">PORTUGAL</span>
                </span>
              </div>
              <p className="mt-4 max-w-sm text-sm text-white/50">
                A comunidade de jogadores portuguesa. O mercado, a galeria e o ranking vivem no Discord — isto é a
                janela para eles.
              </p>
            </div>

            <div className="flex gap-12">
              <nav aria-label="Comunidade">
                <h2 className="font-mono text-[10px] tracking-[0.18em] text-white/35 uppercase">Comunidade</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {SOCIALS.map((social) => (
                    <li key={social.label}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-glow rounded text-white/60 transition-colors hover:text-white"
                      >
                        {social.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav aria-label="Site">
                <h2 className="font-mono text-[10px] tracking-[0.18em] text-white/35 uppercase">Site</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {NAV_LINKS.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className="focus-glow rounded text-white/60 transition-colors hover:text-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {/* M10.2 — the /admin link was removed from here (Luis,
                      2026-08-22). The route is gated on Discord OAuth +
                      ManageMessages (pages/admin/AdminLayout.tsx), so the link
                      was never what protected it; removing it just stops the
                      login form being advertised to every crawler. */}
                  <li>
                    <Link to="/privacy" className="focus-glow rounded text-white/60 transition-colors hover:text-white">
                      Privacidade
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          <p className="mt-10 border-t border-surface-border pt-6 font-mono text-[11px] text-white/30">
            © {new Date().getFullYear()} Game On Portugal — feito por gente que joga.
          </p>
        </div>
      </footer>
    </div>
  );
}
