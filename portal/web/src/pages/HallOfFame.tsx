import { Link } from "react-router-dom";
import { useDocumentHead } from "../lib/seo";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/**
 * M8.8 — Hall of Fame. Plan 03 calls this "the most promotable page on the
 * site" and expects a gallery of past weekly winners.
 *
 * **Why this is a placeholder, not a ranking**: the weekly winner
 * (`discord-bot/src/Application/Query/Screenshot/GetScreenshotWinner/
 * GetScreenshotWinnerHandler.ts`) is computed live from Discord reaction
 * counts on the message each time `WeekScreenshotWinnerJob` runs — reaction
 * counts are read from the Discord API in the moment and never written back
 * to a row. There is no `isWeeklyWinner`/`wonAt` column on `screenshots`
 * (confirmed against `discord-bot/prisma/schema.prisma`'s `Screenshot`
 * model) and no separate winners table, so **the database holds no history
 * of past winners for this page to query** — only whichever screenshot the
 * bot happened to announce winning, once, in a Discord message that then
 * scrolls out of view.
 *
 * Building a real Hall of Fame needs the bot to persist a winner flag/table
 * at the moment `WeekScreenshotWinnerJob` picks one — a schema change,
 * which is `discord-bot/prisma` and explicitly off-limits for this agent
 * (another agent was working in `discord-bot/` concurrently). Faking a
 * ranking from `createdAt` or reaction-less heuristics would misrepresent
 * real winners as data, which the task brief's "do not seed fake content"
 * rules out just as much as literal seed rows would. So this page says so,
 * plainly, instead — and points at Discord, where the real weekly
 * announcement already happens. Recorded as a concrete follow-up in the
 * M8.8 row of docs/plans/GLOBAL-PLAN.md.
 */
export function HallOfFame() {
  useDocumentHead({
    title: "Hall of Fame",
    description: "As screenshots vencedoras da semana na comunidade Game On Portugal.",
    path: "/screenshots/hall-of-fame",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <p className="text-xs font-semibold tracking-[0.3em] text-white/50 uppercase">Hall of Fame</p>
      <h1 className="mt-4 font-display text-3xl">Ainda a construir o histórico</h1>
      <p className="mt-4 text-white/70">
        Todas as semanas, a screenshot com mais reações 🏆 no canal do Discord é anunciada como vencedora — mas essa
        escolha ainda não fica gravada em lado nenhum, por isso esta página ainda não tem um histórico para mostrar.
      </p>
      <p className="mt-2 text-white/70">
        Para veres a vencedora mais recente (e participares na próxima), entra no Discord.
      </p>
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noreferrer"
        className="focus-glow chamfer mt-8 inline-block bg-accent-blue px-6 py-3 font-semibold text-background transition-opacity hover:opacity-90"
      >
        Entrar no Discord
      </a>
      <div className="mt-6">
        <Link to="/screenshots" className="focus-glow text-sm text-white/60 hover:text-white">
          ← Ver a galeria de screenshots
        </Link>
      </div>
    </div>
  );
}
