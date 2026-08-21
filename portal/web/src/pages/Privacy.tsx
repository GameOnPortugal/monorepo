import { Link } from "react-router-dom";
import { useDocumentHead } from "../lib/seo";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/**
 * M9.7 — short privacy page + the deletion-request path GDPR requires
 * (docs/plans/03-portal.md decision 5, docs/plans/GLOBAL-PLAN.md M9.7).
 *
 * Deliberately static content, no API call: this package is read-only over
 * the bot's schema (portal/README.md "Schema ownership") and the mechanisms
 * this page describes — opting out, requesting erasure — are both writes,
 * which only the bot is allowed to perform. So the page explains what data
 * exists and points at the two `/privacy` bot subcommands
 * (discord-bot/src/Infrastructure/Bot/Discord/SlashCommand/Privacy/) rather
 * than offering a form here that would have to call back into the bot.
 */
export function Privacy() {
  useDocumentHead({
    title: "Privacidade",
    description: "Que dados o portal mostra, como te esconderes deles e como pedires que sejam apagados.",
    path: "/privacy",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-xs font-semibold tracking-[0.3em] text-white/50 uppercase">Privacidade</p>
      <h1 className="mt-4 font-display text-3xl">A tua privacidade neste portal</h1>

      <p className="mt-6 text-white/70">
        Este portal mostra publicamente alguns dos conteúdos que publicas no servidor de Discord da Game On
        Portugal: anúncios do marketplace, screenshots submetidas ao concurso e o teu lugar na tabela de troféus.
        Mostramos sempre um nome de apresentação (por exemplo o teu perfil PSN) — nunca o teu ID do Discord.
      </p>

      <h2 className="mt-10 font-display text-xl">Deixar de aparecer publicamente</h2>
      <p className="mt-3 text-white/70">
        Podes esconder todo o teu conteúdo deste portal a qualquer momento, sem apagar nada — os teus anúncios,
        screenshots e perfil de troféus continuam a existir no servidor, só deixam de ser visíveis aqui. Usa o
        comando no Discord:
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-white/5 px-4 py-3 text-sm text-white/90">
        /privacy opt-out
      </pre>
      <p className="mt-3 text-white/70">
        E para voltares a aparecer, a qualquer momento:
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-white/5 px-4 py-3 text-sm text-white/90">
        /privacy opt-in
      </pre>

      <h2 className="mt-10 font-display text-xl">Pedir a eliminação dos teus dados</h2>
      <p className="mt-3 text-white/70">
        Como a comunidade é europeia, tens o direito de pedir que os teus dados sejam apagados (RGPD). Ao contrário
        de esconderes o conteúdo, isto é permanente: apaga mesmo, da base de dados, todos os teus anúncios,
        screenshots e o teu perfil de troféus — não fica só escondido do portal. Usa:
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-white/5 px-4 py-3 text-sm text-white/90">
        /privacy delete-data confirmar:APAGAR
      </pre>
      <p className="mt-3 text-white/70">
        Esta ação não pode ser desfeita. Se preferires que seja outra pessoa a tratar do pedido por ti, ou tiveres
        qualquer dúvida sobre os teus dados, contacta um moderador no servidor de Discord.
      </p>

      <h2 className="mt-10 font-display text-xl">Quem trata destes dados</h2>
      <p className="mt-3 text-white/70">
        A Game On Portugal é uma comunidade de voluntários, não uma empresa — os dados descritos acima vivem na base
        de dados do bot do Discord da comunidade e neste portal, e só são usados para o que já vês aqui: anúncios,
        screenshots e a tabela de troféus.
      </p>

      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer"
        className="focus-glow chamfer mt-10 inline-block bg-accent-blue px-6 py-3 font-semibold text-background transition-opacity hover:opacity-90"
      >
        Entrar no Discord
      </a>
      <div className="mt-6">
        <Link to="/" className="focus-glow text-sm text-white/60 hover:text-white">
          ← Voltar ao início
        </Link>
      </div>
    </div>
  );
}
