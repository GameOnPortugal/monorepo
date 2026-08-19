# State of the project

Snapshot taken **2026-08-19** at commit `31f6699`. Every claim below was checked
against the repo, GitHub, Docker Hub or DNS on that date rather than inferred.

## Timeline

| When                   | What                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| 2021 and earlier       | `old-discord-bot` in active use as the Playstation Portugal community bot   |
| 2021-11-11             | Last change to the live website (still the `last-modified` served today)    |
| 2024-11-13             | Standalone `discord-bot` and `scheduler` repos last touched, then folded in |
| 2025-04                | The TypeScript rewrite lands; a long tail of `chore: another attempt` CI fixes |
| 2025-06-28 / 06-30     | PRs #1 and #2 (marketplace deletion fixes) merged — the last activity       |
| 2025-06-30 08:36 UTC   | Last push of `joshlopes/game-on-portugal-bot:latest` to Docker Hub          |
| **2026-06-29/30**      | **Superman (the CapRover host) decommissioned.** Stack hand-migrated to TedRelayer as docker-compose; database moved and verified by row count |
| 2026-08-19             | This exploration. Repo ~14 months dormant — but the bot is still running.   |

The commit log tells its own story: 30+ consecutive `chore:` commits
(`chore: fff`, `chore: whatever`, `chore: another attempt`) from someone fighting
the CI/Docker pipeline directly on `main`, then two clean PRs, then silence.

## Where everything lives

**Source of truth** — `github.com/GameOnPortugal/monorepo`, public, default
branch `main`. The org also holds:

| Repo                        | Visibility | Last push  | Relationship                                          |
| --------------------------- | ---------- | ---------- | ----------------------------------------------------- |
| `monorepo`                  | public     | 2025-06-30 | This repo                                             |
| `discord-bot`               | public     | 2024-11-13 | **Archived.** Absorbed as `discord-bot/`              |
| `scheduler`                 | private    | 2024-11-13 | Absorbed as `scheduler/`, original never archived     |
| `gameonportugal.github.io`  | public     | 2021-11-11 | **Serves the live website.** Not this repo's `webpage/` |
| `screenshot-bot`            | private    | 2021-07-08 | Unrelated, long dead                                  |

**Container images** — Docker Hub under the personal `joshlopes` namespace, not
an org one: `joshlopes/game-on-portugal-bot` (tags `latest`, `pr-<n>`,
`pr-<sha>`) and `joshlopes/game-on-portugal-scheduler`.

**Runtime** — **TedRelayer**, the home media server (`ssh -p 2224
tedcrypto@192.168.0.184`), as a plain docker-compose stack in
`~/game-on-portugal/`. Five containers, all up for 6–7 weeks:

| Container                     | Image                                          |
| ----------------------------- | ---------------------------------------------- |
| `game-on-portugal-app`        | `joshlopes/game-on-portugal-bot:latest`        |
| `game-on-portugal-scheduler`  | `joshlopes/game-on-portugal-scheduler:latest`  |
| `game-on-portugal-db`         | `mariadb:11.5.2` (healthy)                     |
| `game-on-portugal-redis`      | `redis:7.0.4`                                  |
| `game-on-portugal-db-backup`  | `databack/mysql-backup:v0.12.0` → NAS          |

The bot is genuinely live: its log shows `Ready! Logged in as
GameOnPortugalBot#9387` and `Successfully reloaded 4 application (/) commands`.

Two things about this arrangement matter:

- It was **not** the repo that put it there. Until 2026-06-30 the runtime was a
  CapRover host called *Superman* (Hetzner FSN1-DC5), which was decommissioned
  and its contract cancelled. Someone moved the stack by hand and never updated
  the repo, so **the entire CI/CD deploy path now points at a machine that does
  not exist** and merging to `main` has no effect on production.
- The Redis container is inherited cruft. The rewritten bot never reads
  `REDIS_DSN`; only `old-discord-bot` used Redis. The compose file also passes
  `SENTRY_DSN`, `TROPHY_WEBHOOK` and `TELEGRAM_ACCESS_TOKEN`, none of which the
  current code reads — it was clearly written from the stale `.env.example`.

**Production data** (as of 2026-08-19) — intact and still growing:

| Table            | Rows  | Newest row              |
| ---------------- | ----- | ----------------------- |
| `trophies`       | 4,477 | 2024-12-02              |
| `screenshots`    | 624   | 2026-06-01              |
| `trophyprofiles` | 118   | 2026-06-16              |
| `ads`            | 70    | 2026-08-06              |
| all LFG tables   | **0** | —                       |

Two readings worth noting. Ads are still being posted 13 days ago, so the
community actively uses the bot. Trophies stopped in **December 2024** — because
the psnprofiles.com scraper that fed them was never ported from the old bot, so
`/trophy rank` is ranking two-year-old data. And the LFG tables are **empty**, so
porting LFG is greenfield work with no data-migration concern.

**Observability** — optional Grafana Loki shipping via `winston-loki`, enabled
only when `LOKI_HOST` is set. Telegram notifications on deploy and on workflow
failure, via `.github/actions/send-telegram-message`.

**Website** — `game-on-portugal.pt` resolves to GitHub Pages
(185.199.108-111.153) and `www` CNAMEs to `gameonportugal.github.io`. It returns
200 with `last-modified: Thu, 11 Nov 2021`. The `webpage/` directory here is a
copy carrying the same `CNAME` file, but this repo has **no** Pages site
(`GET /repos/.../pages` → 404) and **no** workflow that touches `webpage/`.
Editing `webpage/` therefore changes nothing anyone can see.

## Subproject detail

### `discord-bot/` — the live one

Bun 1.2.x runtime, TypeScript (strict, `noEmit`), discord.js v14, Prisma 6 over
MySQL/MariaDB, Inversify 7 for DI, Winston for logs. ~3,750 lines across
`src/`. Layered DDD — see [architecture.md](architecture.md).

Shipped slash commands:

| Command                              | What it does                                            |
| ------------------------------------ | ------------------------------------------------------- |
| `/ping`                              | Health check                                            |
| `/screenshot create \| list \| delete` | Community screenshot submissions                         |
| `/trophy create \| check \| rank`      | PSN trophy profiles and leaderboards                     |
| `/marketplace sell \| list \| delete`  | Second-hand marketplace ads                              |

Plus one CLI command, `week-screenshot-winner`, run by the scheduler: it finds
the screenshot with the most 🏆 platinum-emoji reactions in a week, announces the
winner in the screenshots channel and posts `!give-xp <user> 1000`.

Verified working on 2026-08-19: `bun install` (on Node 24), `prisma generate`,
`bun test` (**32 pass / 0 fail** against MariaDB 11.7.2), and
`docker build --target runtime` of the production image. Verified failing:
`bunx tsc --noEmit` (6 errors).

### `scheduler/` — the cron sidecar

An Alpine image bundling [Chadburn](https://github.com/PremoWeb/chadburn) (a Go
cron that drives Docker), supervisord, and a small Python script. On boot,
`update_container.py` looks up the running bot container by name
(`APP_CONTAINER_NAME`), rewrites `config.ini` to point at it, and restarts the
cron job — this indirection exists because CapRover container names carry
generated suffixes.

`config.ini` **in the repo** has exactly one active job:

```ini
[job-exec "weekly-screenshot-winner"]
schedule = 50 23 * * 0
container = game-on-portugal-app-placeholder
command = bun run:command week-screenshot-winner
```

**The deployed container does not have this.** `docker exec
game-on-portugal-scheduler cat /srv/config.ini` shows every job still commented
out, including a `weekly-screenshot-winner` that still reads
`command = node scripts/screenshot-winners.js` — the *old bot's* version. The
reason is a one-day miss: `joshlopes/game-on-portugal-scheduler:latest` was last
pushed **2025-04-19 14:27 UTC**, and commit `c28a73f` ("feat: enable screenshot
winner. run commands"), which activated the job, landed **2025-04-20 09:56** and
was never built into an image.

So the scheduler container has run **zero jobs since it was deployed**. Its logs
contain nothing but the `update-container-id` supervisord loop firing every two
minutes. The weekly screenshot winner — the only reason this component exists —
has never run in production.

Four further jobs are commented out in both versions — `parse-psn-profiles`,
`update-lfg-points`, `has-been-sold`, and the old screenshot-winner — all
invoking `node scripts/…` scripts that exist only in `old-discord-bot/`. They
are dead until those features are ported.

### `old-discord-bot/` — the retired predecessor

Node 15 + discord.js v12 + Sequelize + MySQL 5.6, with Redis, Sentry, Telegram
and a Puppeteer/JSDOM scraper for psnprofiles.com. No CI workflow references it;
it is not built, tested or deployed. Its value is as a specification for the
features that were never ported:

| Old feature                                | Ported? | Notes                                                             |
| ------------------------------------------ | ------- | ----------------------------------------------------------------- |
| `ping`                                     | ✅       |                                                                   |
| `screenshot`                               | ✅       |                                                                   |
| `trophy`                                   | Partial | Profiles and rank yes; the psnprofiles.com scraper that *feeds* them, no |
| `market sell`                              | ✅       |                                                                   |
| `market wanted`                            | ❌       |                                                                   |
| `lfg` (create/cancel/rank/commend/miss, ban/unban, report workflow) | ❌ | The largest gap — 11 subcommands, plus a points engine |
| `stock` (stock-alert URL watching)         | ❌       |                                                                   |
| `channel` / `commandChannelLink` / `prefix`| ❌       | Largely obsoleted by slash commands                               |

Note the schema keeps `LFGProfile`, `LFGGame`, `LFGParticipation`, `LFGEvent`,
`StockUrls`, `SpecialChannel` and `CommandChannelLink` models with a comment
reading *"Other models from the original project — these can be implemented as
needed"*. The tables exist in production but are **all empty** (checked), so the
old LFG history did not survive the Sequelize→Prisma move. Porting LFG is
therefore greenfield: no migration, no backfill, but also no continuity of the
community's old rankings.

### `webpage/` — orphaned

BootstrapMade "Personal" template v4.6.0, in Portuguese, with `index.html`,
`discord.html`, `portfolio-details.html`, a PHP contact form under `forms/`
(nothing serves PHP), and a body background pulled from
`source.unsplash.com/featured/…` — an endpoint Unsplash retired, so that
background is dead wherever this is served from. Listed in the release-please
config and the labeler, built and deployed by nothing.

## CI/CD as it stands

Nine workflows under `.github/workflows/`. Per-project `bot.yaml` and
`scheduler.yaml` orchestrate reusable `shared.*` workflows for tests, image
build and CapRover deploy; `global.release-please.yaml` handles versioning;
`shared.labeler.yaml` auto-labels PRs; two workflows send Telegram messages.

Observed facts:

- **The deploy jobs target a decommissioned machine.** Both `bot.yaml` and
  `scheduler.yaml` deploy via `caprover/deploy-from-github` to the CapRover host
  *Superman*, whose Hetzner contract was cancelled on 2026-06-30. The pipeline
  would build and push images fine, then fail (or worse, succeed against
  nothing) at the deploy step. Production is now updated by hand on TedRelayer.
- Actions are **enabled**, all nine workflows **active**.
- `gh run list` returns **zero runs** — nothing has run since at least the
  retention horizon, consistent with 14 months of dormancy.
- **Zero git tags and zero GitHub releases exist**, despite release-please having
  been configured and running on every `main` push since April 2025. Both
  manifest entries are still `0.0.0`. Either `MY_RELEASE_PLEASE_TOKEN` was never
  valid, or every commit since has been `chore:`-typed and thus release-less
  (which the commit log makes entirely plausible).
- `webpage/` has no workflow at all, and `scheduler` is in
  `release-please-config.json` but **missing from `.release-please-manifest.json`**.
- The static-analysis job in `bot.yaml` is commented out, pointing at
  `TedcryptoOrg/github-actions` — a third-party org's shared workflows, i.e. a
  cross-project dependency inherited from the author's other work.

## Overall read

A small, competently structured project that stopped being *maintained* without
ever stopping *running*. The bones are good: clean layering, real integration
tests, a reproducible Docker build, a sensible CI skeleton, and 4,477 trophies'
worth of community history still in the database.

What the fourteen months actually cost is subtler than "it broke". The code kept
serving, so nobody noticed that:

- `/marketplace sell` has been half-failing on **every single use** since the
  rewrite went live;
- the scheduler has never executed a job, because an image was never rebuilt
  after a one-line config change;
- `/trophy rank` has been ranking data frozen in December 2024;
- and the deploy pipeline quietly detached from reality when the host it
  targets was decommissioned.

Each of these is individually small and individually invisible. That is the real
finding: the project's problem is not fragility, it is the **absence of any
signal** — no type gate, no linter, no release, no alerting, no test coverage on
the layer where all three live bugs live. Reviving it means restoring feedback
first and features second.
