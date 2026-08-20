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

One live subproject and one retired one. `discord-bot/` is a Bun +
TypeScript + discord.js v14 + Prisma/MySQL bot with a clean layered
architecture, 32 passing integration tests, and a production Docker image that
still builds today. `webpage/` is a static site that is **not** what serves
game-on-portugal.pt.

`old-discord-bot/`, the retired Node 15 predecessor, was **deleted 2026-08-20
(M9.6)** once M7 had taken what it needed from it (the psnprofiles.com
scraper) and the remaining un-ported features (LFG, stock alerts) were
formally dropped rather than ported. It is fully preserved in git history —
`git log -- old-discord-bot` — just no longer checked out. Docs written before
that date (this one included) still describe it in the present tense in
places; treat any such reference as historical.

The `scheduler/` container (a Chadburn cron sidecar) **was deleted** because it
never executed any jobs in production (see [known-issues.md](known-issues.md) #3).
It was not migrated to HTZ1; the `week-screenshot-winner` job now has no automatic
trigger until the in-process replacement (plan 02, M6.1) ships.

**The bot is live** on HTZ1 as a Portainer stack since **2026-08-19**, with
~5,000 trophies and 70 ads of real community data, and members still using it.

Two things are broken in production right now and neither ever surfaced:

- `/marketplace sell` throws on **every** use — 28 of 33 post-rewrite ads are
  orphaned from their Discord message.
- `/trophy rank` presents a leaderboard frozen since **December 2024** as if it
  were live, because the scraper feeding it was never ported.

Underneath sits the reason both went unnoticed: no type gate, no linter, no
release ever cut, no tests on the discord.js layer where both live. Details
in [known-issues.md](known-issues.md), sequencing in the global plan.
