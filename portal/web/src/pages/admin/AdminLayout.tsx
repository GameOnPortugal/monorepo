import { NavLink, Outlet, useSearchParams } from "react-router-dom";
import { discordLoginUrl, useAdminAuth } from "../../lib/AdminAuthContext";
import { useDocumentHead } from "../../lib/seo";

const NAV_LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/ads", label: "Anúncios" },
  { to: "/admin/screenshots", label: "Screenshots" },
  { to: "/admin/trophy-profiles", label: "Perfis de troféus" },
  { to: "/admin/jobs", label: "Jobs" },
  { to: "/admin/audit-log", label: "Registo de auditoria" },
];

/**
 * M8.10 — the gate every /admin/* route sits behind. Three states, in
 * order:
 *
 *  1. **Not configured** (`configured: false` — no DISCORD_CLIENT_ID/
 *     DISCORD_CLIENT_SECRET/SESSION_SECRET on portal-api). This is the
 *     "degrades safely" state the task brief requires: the rest of the
 *     site is completely unaffected (see App.tsx — /admin is the only
 *     route tree this file touches), this page alone says plainly that
 *     admin login isn't set up yet.
 *  2. **Not authenticated** — a "Entrar com Discord" button that sends the
 *     browser to `GET /api/auth/login` (a real navigation, not a fetch —
 *     OAuth redirects can't happen inside `fetch`). `?error=forbidden`/
 *     `?error=oauth_failed` (routes/auth.ts's callback redirects) render as
 *     an inline message rather than a silent bounce back to this screen.
 *  3. **Authenticated** — the actual admin shell: a nav row + whichever
 *     page matched under /admin/*.
 *
 * Never a redirect-away-from-/admin for cases 1/2: an admin who bookmarks
 * `/admin/ads` should land back on the login screen after re-authenticating
 * via routes/auth.ts's `/admin` redirect target, not lose their place.
 */
export function AdminLayout() {
  useDocumentHead({ title: "Admin", noindex: true, path: "/admin" });

  const { authenticated, configured, loading, user, logout } = useAdminAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-white/60" aria-busy>
        A verificar sessão…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl">Admin não configurado</h1>
        <p className="mt-4 border-l-2 border-accent-red pl-3 text-left text-sm text-white/80">
          O login de administrador ainda não está configurado neste ambiente (faltam variáveis de OAuth do Discord no
          portal-api). O resto do site funciona normalmente.
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl">Área de administração</h1>
        <p className="mt-2 text-white/60">
          Acesso restrito a administradores do servidor Discord (permissão "Gerir mensagens").
        </p>
        {error === "forbidden" && (
          <p className="mt-4 border-l-2 border-accent-red pl-3 text-left text-sm text-white/80">
            A tua conta Discord não tem acesso de administrador neste servidor.
          </p>
        )}
        {error === "oauth_failed" && (
          <p className="mt-4 border-l-2 border-accent-red pl-3 text-left text-sm text-white/80">
            Falha ao autenticar com o Discord. Tenta novamente.
          </p>
        )}
        <a
          href={discordLoginUrl()}
          className="focus-glow chamfer mt-8 inline-block bg-accent-blue px-6 py-3 font-semibold text-background transition-opacity hover:opacity-90"
        >
          Entrar com Discord
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-4">
        <nav className="flex flex-wrap gap-4 text-sm text-white/70">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `focus-glow hover:text-white ${isActive ? "text-white" : ""}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span>{user?.username}</span>
          <button type="button" onClick={() => void logout()} className="focus-glow hover:text-white">
            Sair
          </button>
        </div>
      </div>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
