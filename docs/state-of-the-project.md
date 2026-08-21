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
| **2026-08-19**         | **Infrastructure migration executed.** Production cut over from TedRelayer to HTZ1 (Portainer stack `game-on-portugal`, id 46), CI wired to deploy on merge. See [`plans/04-infrastructure-migration.md`](plans/04-infrastructure-migration.md). TedRelayer kept stopped-but-intact as rollback until 2026-09-02 |

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
| `scheduler`                 | private    | 2024-11-13 | Absorbed as `scheduler/`, original never archived; directory deleted 2026-08-19 |
| `gameonportugal.github.io`  | public     | 2021-11-11 | Served the live website until 2026-08-21. **Archived** once the portal took over the apex |
| `screenshot-bot`            | private    | 2021-07-08 | Unrelated, long dead                                  |

**Container images** — Docker Hub under the personal `joshlopes` namespace, not
an org one: `joshlopes/game-on-portugal-bot` (tags `latest`, `pr-<n>`,
`pr-<sha>`). The `joshlopes/game-on-portugal-scheduler` image is no longer built
or deployed as of 2026-08-19.

**Runtime** — **HTZ1** (`ssh -p 2224 ezweb@195.201.192.35`), Portainer stack
`game-on-portugal` (stack id `46`, endpoint `3`), since the **2026-08-19**
cutover. Five containers:

| Container           | Image                                           |
| -------------------- | ------------------------------------------------ |
| `gop-bot`            | `joshlopes/game-on-portugal-bot:${APP_VERSION}`   |
| `gop-db`             | `mariadb:11.7.2` (healthy)                        |
| `gop-minio`          | `minio/minio` — public `gop-media` bucket         |
| `gop-createbuckets`  | `minio/mc` — one-shot bucket setup                |
| `gop-db-backup`      | `databack/mysql-backup:v0.12.0`                   |

The bot is genuinely live: its log shows `Ready! Logged in as
GameOnPortugalBot#9387` and `Successfully reloaded 4 application (/) commands`.
There is no `redis` container in the new stack at all — the rewritten bot
never reads `REDIS_DSN`; only `old-discord-bot` used Redis.

Until this cutover, runtime was **TedRelayer**, the home media server, as a
plain docker-compose stack in `~/game-on-portugal/` — itself a hand-migration
off *Superman* (a decommissioned CapRover host) that the repo's CI never found
out about, so merging to `main` had no effect on production for over a year.
That TedRelayer stack is kept **stopped-but-intact** as the rollback path
until **2026-09-02** — `game-on-portugal-app` and `-scheduler` are stopped,
`-db`/`-redis`/`-db-backup` still run (though `-scheduler` is also no longer
maintained). See [`operations.md`](operations.md)'s
"Rollback path" section. `deploy.yml`'s `push` trigger is now enabled, so
merging to `main` **does** deploy, to HTZ1, for real.

**Production data** (as of 2026-08-19) — intact and still growing:

| Table            | Rows  | Newest row              |
| ---------------- | ----- | ----------------------- |
| `trophies`       | 4,971 | 2024-12-02              |
| `screenshots`    | 624   | 2026-06-01              |
| `trophyprofiles` | 118   | 2026-06-16              |
| `ads`            | 70    | 2026-08-06              |
| all LFG tables   | **0** | —                       |

The trophies count was corrected from an earlier estimate of 4,477 during the
2026-08-19 migration's phase-0 dump-and-restore: 4,477 came from
`information_schema.tables.table_rows`, an *estimate* for InnoDB, not an exact
count; `SELECT COUNT(*)` gives 4,971. The other three figures were exact
either way.

Two readings worth noting. Ads are still being posted 13 days ago, so the
community actively uses the bot. Trophies stopped in **December 2024** — because
the psnprofiles.com scraper that fed them was never ported from the old bot, so
`/trophy rank` is ranking two-year-old data. And the LFG tables are **empty**, so
porting LFG is greenfield work with no data-migration concern.

**Observability** — optional Grafana Loki shipping via `winston-loki`, enabled
only when `LOKI_HOST` is set. Telegram notifications on deploy and on workflow
failure, via `.github/actions/send-telegram-message`.

**Website** — *(superseded 2026-08-21 by the M8.15 apex cutover: the domain
and `www` now resolve to HTZ1 and serve `portal/`; `gameonportugal.github.io`
is archived and `webpage/` is deleted.)* As of this snapshot,
`game-on-portugal.pt` resolved to GitHub Pages (185.199.108-111.153) and `www`
CNAMEd to `gameonportugal.github.io`, returning 200 with
`last-modified: Thu, 11 Nov 2021`. The `webpage/` directory here was a copy
carrying the same `CNAME` file, but this repo had **no** Pages site
(`GET /repos/.../pages` → 404) and **no** workflow touching `webpage/`, so
editing it changed nothing anyone could see.

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

### `scheduler/` — the cron sidecar (deleted 2026-08-19)

The `scheduler/` directory contained an Alpine image bundling [Chadburn](https://github.com/PremoWeb/chadburn) (a Go
cron that drives Docker), supervisord, and a small Python script. On boot,
`update_container.py` would look up the running bot container by name
(`APP_CONTAINER_NAME`), rewrite `config.ini` to point at it, and restart the
cron job — this indirection existed because CapRover container names carry
generated suffixes.

The `config.ini` **in the repo** had exactly one active job:

```ini
[job-exec "weekly-screenshot-winner"]
schedule = 50 23 * * 0
container = game-on-portugal-app-placeholder
command = bun run:command week-screenshot-winner
```

**The deployed container did not have this.** `docker exec
game-on-portugal-scheduler cat /srv/config.ini` showed every job still commented
out, including a `weekly-screenshot-winner` that still read
`command = node scripts/screenshot-winners.js` — the *old bot's* version. The
reason was a one-day miss: `joshlopes/game-on-portugal-scheduler:latest` was last
pushed **2025-04-19 14:27 UTC**, and commit `c28a73f` ("feat: enable screenshot
winner. run commands"), which activated the job, landed **2025-04-20 09:56** and
was never built into an image.

So the scheduler container had run **zero jobs since it was deployed**. Its logs
contained nothing but the `update-container-id` supervisord loop firing every two
minutes. The weekly screenshot winner — the only reason this component existed —
never ran in production.

Four further jobs were commented out in both versions — `parse-psn-profiles`,
`update-lfg-points`, `has-been-sold`, and the old screenshot-winner — all
invoking `node scripts/…` scripts that existed only in `old-discord-bot/`. They
were dead until those features were ported.

**The directory was deleted during work item M6.7 (2026-08-19).** It was never
migrated to the HTZ1 stack — `infrastructure/game-on-portugal.yaml` has no scheduler
service at all, so there is no cron trigger for `week-screenshot-winner`
anywhere. [`plans/02-scheduler-and-lifecycle.md`](plans/02-scheduler-and-lifecycle.md)
describes the in-process cron replacement (M6.1) that will restore this capability.

### `old-discord-bot/` — the retired predecessor

**The directory was deleted during work item M9.6 (2026-08-20).** By then M7
had taken what it needed from the psnprofiles.com scraper (`TrophySource` /
`PsnProfilesTrophySource` in `discord-bot/src`), and LFG / stock alerts / the
Telegram bridge had all been formally dropped rather than ported (M9.3, M9.4).
Nothing else in the tree referenced the directory by path — it is preserved in
full in git history (`git log -- old-discord-bot`), just no longer checked out.
The table below is left as it stood in the 2026-08-19 snapshot, for the
historical record.

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

### `webpage/` — orphaned, and **deleted 2026-08-21**

**The directory was deleted once M8.15 pointed the apex at the portal** and
`GameOnPortugal/gameonportugal.github.io` was archived — the two things that
had made it, however uselessly, the last copy of the old markup in the working
tree. It is preserved in git history (`git log -- webpage`). The description
below is left as it stood in the 2026-08-19 snapshot.

BootstrapMade "Personal" template v4.6.0, in Portuguese, with `index.html`,
`discord.html`, `portfolio-details.html`, a PHP contact form under `forms/`
(nothing serves PHP), and a body background pulled from
`source.unsplash.com/featured/…` — an endpoint Unsplash retired, so that
background is dead wherever this is served from. Listed in the release-please
config and the labeler, built and deployed by nothing.

## CI/CD as it stands

Eight workflows under `.github/workflows/`: `ci.yml` (typecheck + tests),
`docker-build.yml` (PR image build, no push), `deploy.yml` (build, push, roll
the Portainer stack), `release-please.yml`, `pr-title.yml`, `labeler.yml`,
`security.yml` and `workflow-failed.yml`. The original nine CapRover-era
workflows (`bot.yaml`, `scheduler.yaml`, their `shared.*` dependencies) were
deleted when this pipeline replaced them — they deployed via
`caprover/deploy-from-github` to *Superman*, decommissioned 2026-06-30.

Observed facts, as of the 2026-08-19 cutover:

- **The deploy pipeline works end to end.** `deploy.yml`'s `push` trigger is
  enabled; merging to `main` builds `joshlopes/game-on-portugal-bot`, pushes
  it, and rolls Portainer stack `game-on-portugal` (id 46) on HTZ1 over an SSH
  tunnel. Verified by the cutover itself: the real deploy path put the current
  build on HTZ1 with ~2 minutes of downtime.
- Actions are **enabled**, all eight workflows **active**.
- Release-please is wired (config + manifest under `.github/`, `pr-title.yml`
  enforcing Conventional Commits, `discord-bot`'s `package.json` given a
  `version`), but **no release has actually been cut yet** — that needs a
  `feat:`/`fix:`-titled PR to merge first, and `RELEASE_PLEASE_TOKEN` was not
  created during the migration (falls back to `GITHUB_TOKEN`, which works but
  means the release PR itself gets no CI run). See known-issues.md #6.
- ~~`webpage/` still has no workflow at all, and is still slated for deletion
  along with the rest of the orphaned static site.~~ **Deleted 2026-08-21**,
  with the apex cutover.

## Overall read

A small, competently structured project that stopped being *maintained* without
ever stopping *running*. The bones are good: clean layering, real integration
tests, a reproducible Docker build, a sensible CI skeleton, and 4,971 trophies'
worth of community history still in the database.

What the fourteen months actually cost is subtler than "it broke". The code kept
serving, so nobody noticed that:

- `/marketplace sell` has been half-failing on **every single use** since the
  rewrite went live;
- the scheduler has never executed a job, because an image was never rebuilt
  after a one-line config change, and it has since been retired outright
  without a replacement cron trigger yet built (plan 02);
- `/trophy rank` has been ranking data frozen in December 2024;
- and the deploy pipeline quietly detached from reality when the host it
  targeted was decommissioned — fixed 2026-08-19 by the HTZ1 migration, which
  also caught a second, unrelated instance of the same failure mode: the
  nightly database backup had been silently failing to upload for seven weeks.

Each of these is individually small and individually invisible. That is the real
finding: the project's problem is not fragility, it is the **absence of any
signal** — no type gate, no linter, no release, no alerting, no test coverage on
the layer where all three live bugs live. Reviving it means restoring feedback
first and features second.
