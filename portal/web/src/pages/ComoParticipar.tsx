import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useDocumentHead } from "../lib/seo";

const DISCORD_INVITE = "https://discord.gg/mBJKUhwE23";

/**
 * M10.10 + M10.11 — "Como participar".
 *
 * The portal is read-only by construction (portal/README.md, "Schema
 * ownership"): every action a member can take — registering a PSN profile,
 * posting an ad, submitting a screenshot — happens in the bot, in Discord.
 * Before this page the site showed the *results* of all three and never
 * explained how to get into any of them, which is what Luis meant by "feels
 * like it could have more information in it".
 *
 * So every section here ends in Discord rather than in a form. That is not a
 * limitation being papered over; it is the actual architecture, and saying
 * so plainly is more useful than a call-to-action that leads nowhere.
 *
 * Every command name, limit and threshold below is read from the bot's own
 * source rather than remembered, because a page of confidently wrong
 * instructions is worse than no page:
 *   - subcommands: Infrastructure/Bot/Discord/SlashCommand/{Trophy,Marketplace}
 *   - MAX_ACTIVE_ADS_PER_USER = 10           (Domain/Marketplace/AdLimits.ts)
 *   - AD_LIFECYCLE_IDLE_DAYS = 14            (Domain/Marketplace/AdLifecyclePolicy.ts)
 *   - AD_LIFECYCLE_RESPONSE_HOURS = 72       (same file)
 *   - the rarity → TP ladder                 (Domain/Trophy/TrophyPoints.ts)
 *   - the two exclusion reasons              (Infrastructure/Job/Jobs/TrophiesSyncJob.ts)
 * If any of those change, this page is wrong and must change with them.
 */
export function ComoParticipar() {
  useDocumentHead({
    title: "Como participar",
    description:
      "Como entrar no ranking de troféus, publicar no marketplace e participar no concurso de screenshots da Game On Portugal.",
    path: "/como-participar",
  });

  // The browser only honours a `#fragment` when it is present in the document
  // it just loaded. Arriving here through a client-side <Link> from
  // /trophies#fora-do-ranking changes the URL without a document load, so
  // nothing scrolls and the deep link silently behaves like a plain link to
  // the top of the page — which would quietly break exactly the two entry
  // points M10.10 added to the leaderboard. Scroll it ourselves.
  //
  // `scroll-mt-*` on the section handles the sticky header's overlap; this
  // only handles *whether* the scroll happens at all.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // The layout effect ordering means the target may not be painted yet on
    // first mount; a frame's delay is enough and avoids a layout thrash.
    const frame = requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="text-center">
        <BrandMark variant="lg" className="mx-auto h-16" />
        <h1 className="mt-4 font-display text-3xl">Como participar</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/70">
          Tudo o que vês neste site acontece primeiro no Discord — o ranking, os anúncios e as screenshots são
          publicados por membros através do bot. Este site mostra o resultado; para participares, o sítio é o
          Discord.
        </p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
          className="focus-glow chamfer mt-6 inline-block bg-accent-blue px-6 py-3 font-semibold text-background transition-opacity hover:opacity-90"
        >
          Entrar no Discord
        </a>
      </header>

      <Section id="ranking" title="Ranking de troféus">
        <p>
          O ranking soma os <strong>troféus de platina</strong> de cada jogador, lidos do perfil público no
          PSNProfiles. Quanto mais rara for a platina, mais pontos vale.
        </p>
        <Steps>
          <Step n={1}>
            Tem o teu perfil no <ExternalLink href="https://psnprofiles.com">PSNProfiles</ExternalLink> visível
            publicamente.
          </Step>
          <Step n={2}>
            No Discord, corre <Command>/trophy create</Command> e cola o endereço do teu perfil no campo{" "}
            <Code>psnprofiles_url</Code>.
          </Step>
          <Step n={3}>
            Já está. O bot sincroniza periodicamente e as tuas platinas passam a contar — vê a tua posição com{" "}
            <Command>/trophy rank</Command> ou aqui na{" "}
            <Link to="/trophies" className="focus-glow text-accent-blue hover:underline">
              página de troféus
            </Link>
            .
          </Step>
        </Steps>

        <h3 className="mt-6 font-display text-base">Como são contados os pontos</h3>
        <p className="mt-2">
          Cada platina vale pontos conforme a percentagem de jogadores que a conquistaram — quanto mais rara, mais
          vale:
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] border border-surface-border text-left text-sm">
            <thead className="bg-surface text-white/70">
              <tr>
                <th scope="col" className="px-3 py-2 font-normal">
                  Raridade da platina
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Pontos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {[
                ["Mais de 30%", "50"],
                ["15% – 30%", "100"],
                ["8% – 15%", "250"],
                ["5% – 8%", "500"],
                ["2% – 5%", "800"],
                ["0,6% – 2%", "1 250"],
                ["Até 0,6%", "2 000"],
              ].map(([rarity, points]) => (
                <tr key={rarity}>
                  <td className="px-3 py-2 text-white/80">{rarity}</td>
                  <td className="px-3 py-2 font-display">{points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-white/60">
          Só contam platinas. Troféus de ouro, prata e bronze não somam pontos para o ranking.
        </p>
      </Section>

      {/*
        M10.11 — this is the "banlist page" ask, redesigned.

        A public, named, permanent list of excluded members would be a
        pillory: search-indexable, outliving whatever caused it, and — the
        decisive point — mostly *wrong about what it implies*. Read
        TrophiesSyncJob: `isBanned` is set when PSNProfiles shows no visible
        rank ("sem rank visível no PSNProfiles"), i.e. the profile went
        private, was renamed or was deleted. It does not mean the member did
        anything wrong; the column name is a legacy misnomer inherited from
        the old bot's "if we can't read the profile it's probably banned"
        heuristic. `hasLeft` just means they left the server.

        So the page that actually serves Luis's stated goal — "the option for
        people come to discord to cry it over" — is this one: it reaches the
        much larger group whose profile broke for a boring, fixable reason,
        and still routes the genuinely-moderated case to Discord to appeal.
        Names stay in the admin surface (AdminTrophyProfiles.tsx), which
        moderators already have. See docs/plans/09-portal-community-identity.md
        decision 2.
      */}
      <Section id="fora-do-ranking" title="Porque é que não apareço no ranking?">
        <p>
          Se já te registaste e não apareces, é quase sempre uma destas razões — e as duas primeiras resolves tu
          mesmo em menos de um minuto:
        </p>
        <dl className="mt-4 space-y-4">
          <Reason term="O teu perfil no PSNProfiles está privado">
            É a causa mais comum. Se o bot não consegue ler o teu rank, não consegue contar as tuas platinas. Torna o
            perfil público e voltas a entrar na sincronização seguinte.
          </Reason>
          <Reason term="Mudaste de nome na PSN">
            O registo guarda o nome que usaste no <Command>/trophy create</Command>. Se mudou, volta a correr o
            comando com o endereço novo.
          </Reason>
          <Reason term="Saíste do servidor">
            O ranking é da comunidade, por isso só conta quem está no Discord. Voltas a entrar, voltas a contar.
          </Reason>
          <Reason term="Foste excluído por um moderador">
            Acontece raramente e é sempre uma decisão humana. Fala connosco no Discord — explica-se e, se for um
            engano, corrige-se.
          </Reason>
        </dl>
        <p className="mt-4 text-sm text-white/60">
          Nenhuma destas situações apaga os teus troféus: o perfil deixa de contar para o ranking, mas os dados
          ficam guardados e voltam a aparecer assim que a causa for resolvida.
        </p>
        <DiscordCta>Falar connosco no Discord</DiscordCta>
      </Section>

      <Section id="marketplace" title="Marketplace">
        <p>
          Compra e venda entre membros. Os anúncios são publicados no canal <Code>#anuncios</Code> pelo bot, para
          que fiquem todos no mesmo sítio independentemente de onde corres o comando.
        </p>
        <Steps>
          <Step n={1}>
            <Command>/marketplace sell</Command> para vender — preenche nome, preço, estado, zona, envio e garantia.
            Podes juntar uma fotografia.
          </Step>
          <Step n={2}>
            <Command>/marketplace wanted</Command> se andas à procura de alguma coisa em vez de vender.
          </Step>
          <Step n={3}>
            Quando vender, <Command>/marketplace sold</Command>. Para corrigir preço ou descrição sem republicar,{" "}
            <Command>/marketplace edit</Command>.
          </Step>
        </Steps>

        <h3 className="mt-6 font-display text-base">Regras que convém saber</h3>
        <ul className="mt-2 space-y-2">
          <Bullet>
            Podes ter até <strong>10 anúncios activos</strong> ao mesmo tempo.
          </Bullet>
          <Bullet>
            Um anúncio parado há <strong>14 dias</strong> recebe uma mensagem privada a perguntar se ainda está
            disponível. Tens <strong>72 horas</strong> para responder — se não responderes, passa a expirado.
          </Bullet>
          <Bullet>
            Um anúncio expirado não desaparece: <Command>/marketplace bump</Command> volta a pô-lo no topo.
          </Bullet>
          <Bullet>
            Para veres o que está à venda sem sair do Discord: <Command>/marketplace list</Command> ou{" "}
            <Command>/marketplace search</Command>.
          </Bullet>
        </ul>
        <p className="mt-4">
          <Link to="/marketplace" className="focus-glow text-accent-blue hover:underline">
            Ver os anúncios activos →
          </Link>
        </p>
      </Section>

      <Section id="screenshots" title="Screenshots e concurso semanal">
        <p>
          Partilha as tuas melhores capturas com <Command>/screenshot</Command>. Ficam na{" "}
          <Link to="/screenshots" className="focus-glow text-accent-blue hover:underline">
            galeria
          </Link>{" "}
          e entram no concurso da semana.
        </p>
        <p className="mt-3">
          Vota nas dos outros reagindo com o emoji de <strong>platina</strong> na mensagem do canal. Todas as
          semanas, ao domingo à noite, a screenshot com mais votos é anunciada como vencedora.
        </p>
        <DiscordCta>Partilhar uma screenshot</DiscordCta>
      </Section>

      <Section id="privacidade" title="Não quero aparecer no site">
        <p>
          Sem problema, e não precisas de pedir a ninguém: <Command>/privacy opt-out</Command> no Discord remove os
          teus anúncios, screenshots e perfil de troféus das páginas públicas deste site. <Command>/privacy opt-in</Command>{" "}
          reverte.
        </p>
        <p className="mt-3">
          <Link to="/privacy" className="focus-glow text-accent-blue hover:underline">
            Ler a página de privacidade →
          </Link>
        </p>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 border-t border-surface-border pt-8">
      <h2 className="font-display text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-white/80">{children}</div>
    </section>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-4 space-y-3">{children}</ol>;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      {/* Near-black on an accent fill, never white on accent — every one of
          the four brand colours fails AA the other way round (see
          lib/platforms.ts's contrast table). */}
      <span
        aria-hidden
        className="chamfer flex h-6 w-6 shrink-0 items-center justify-center bg-accent-mint font-display text-xs text-background"
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 bg-accent-yellow" />
      <span>{children}</span>
    </li>
  );
}

function Reason({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-surface-border pl-4">
      <dt className="font-semibold text-white">{term}</dt>
      <dd className="mt-1 text-white/70">{children}</dd>
    </div>
  );
}

function Command({ children }: { children: React.ReactNode }) {
  return <code className="bg-surface px-1.5 py-0.5 font-mono text-sm text-accent-mint">{children}</code>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-surface px-1.5 py-0.5 font-mono text-sm text-white/80">{children}</code>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="focus-glow text-accent-blue hover:underline">
      {children}
    </a>
  );
}

function DiscordCta({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={DISCORD_INVITE}
      target="_blank"
      rel="noreferrer"
      className="focus-glow chamfer mt-5 inline-block border border-surface-border px-5 py-2 text-sm text-white/80 transition-colors hover:text-white"
    >
      {children}
    </a>
  );
}
