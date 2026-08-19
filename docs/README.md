# GameOnPortugal monorepo — documentation

Written 2026-08-19 against commit `31f6699`, after the repo had been dormant for
roughly fourteen months. Start at [`../AGENT.md`](../AGENT.md) for the
short version.

| Document                                             | Read it when                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| [state-of-the-project.md](state-of-the-project.md)   | You need to know what exists, what is deployed where, and what is dead     |
| [architecture.md](architecture.md)                   | You are about to change `discord-bot/` code                                |
| [operations.md](operations.md)                       | You need to build, release, deploy, or debug the running bot               |
| [known-issues.md](known-issues.md)                   | You want the itemised list of what is broken or rotten, with severities    |
| [revival-plan.md](revival-plan.md)                   | You are picking up the revival work and want a sequenced plan              |
| [plans/](plans/00-overview.md)                       | You are an agent about to build one of the three current workstreams       |

## Active workstreams

Detailed, self-contained plans written to be handed to independent agents:

| Plan | Scope |
| ---- | ----- |
| [00 — Overview](plans/00-overview.md) | Shared context, brand assets, data reality. **Read first.** |
| [01 — Marketplace overhaul](plans/01-marketplace-overhaul.md) | `/marketplace` correctness + UX, in Portuguese |
| [02 — Scheduler & lifecycle](plans/02-scheduler-and-lifecycle.md) | Job runner, ad bump/expiry, screenshot recovery |
| [03 — Community portal](plans/03-portal.md) | Public site + admin portal |
| [04 — Infrastructure migration](plans/04-infrastructure-migration.md) | TedRelayer → HTZ1 Portainer, CI/CD, release-please. **Repo side already built** |

## The 60-second version

Four subprojects, one of which really matters. `discord-bot/` is a Bun +
TypeScript + discord.js v14 + Prisma/MySQL bot with a clean layered
architecture, 32 passing integration tests, and a production Docker image that
still builds today. `scheduler/` is a small Chadburn cron container meant to run
one weekly job inside the bot container. `old-discord-bot/` is the retired Node
15 predecessor, kept only so the un-ported features can be read. `webpage/` is a
static site that is **not** what serves game-on-portugal.pt.

**The bot is live** on TedRelayer (`~/game-on-portugal/`, docker-compose), with
4,477 trophies and 70 ads of real community data, and members still using it.
But it was hand-migrated off a decommissioned CapRover host in June 2026 and the
repo never found out, so **CI deploys to a machine that no longer exists**.

Three things are broken in production right now and none of them ever surfaced:

- `/marketplace sell` throws on **every** use — 28 of 33 post-rewrite ads are
  orphaned from their Discord message.
- The scheduler has **never executed a job**; its image predates the commit that
  enabled the weekly screenshot winner by seventeen hours.
- `/trophy rank` presents a leaderboard frozen since **December 2024** as if it
  were live, because the scraper feeding it was never ported.

Underneath sits the reason all three went unnoticed: no type gate, no linter, no
release ever cut, no tests on the discord.js layer where all three live. Details
in [known-issues.md](known-issues.md), sequencing in
[revival-plan.md](revival-plan.md).
