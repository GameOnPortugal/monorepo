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
| [revival-plan.md](revival-plan.md)                   | You want the original narrative sequencing (superseded by the global plan) |
| [session-log-2026-08-19.md](session-log-2026-08-19.md) | You want the record of how all of this was found, and why each call was made |
| [plans/](plans/00-overview.md)                       | You are an agent about to build one of the workstreams                     |

## ▶ Start here

**[`plans/GLOBAL-PLAN.md`](plans/GLOBAL-PLAN.md) is the master work queue.** It
sequences every finding in every document below into 92 numbered work items
across 10 milestones, with a traceability appendix mapping each item back to its
evidence. If you are about to do work on this repo, read that first and pick an
item; everything else here is either evidence or per-area detail.

## Active workstreams

Detailed, self-contained plans written to be handed to independent agents:

| Plan | Scope |
| ---- | ----- |
| [00 — Overview](plans/00-overview.md) | Shared context, brand assets, data reality. **Read first.** |
| [01 — Marketplace overhaul](plans/01-marketplace-overhaul.md) | `/marketplace` correctness + UX, in Portuguese |
| [02 — Scheduler & lifecycle](plans/02-scheduler-and-lifecycle.md) | Job runner, ad bump/expiry, screenshot recovery |
| [03 — Community portal](plans/03-portal.md) | Public site + admin portal |
| [04 — Infrastructure migration](plans/04-infrastructure-migration.md) | TedRelayer → HTZ1 Portainer, CI/CD, release-please. **Repo side already built** |
| [05 — Bot audit & hardening](plans/05-bot-audit-and-hardening.md) | Security, correctness and API findings across the whole bot |
| [06 — Discord API modernisation](plans/06-discord-api-modernisation.md) | Deprecations, deferred replies, components, registration metadata |
| [07 — Dependency upgrades](plans/07-dependency-upgrades.md) | Locked inventory, hygiene defects, the undici pin, Prisma 6→7 |

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
