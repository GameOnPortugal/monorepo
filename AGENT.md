# AGENT.md

Agent-facing guide to the **GameOnPortugal monorepo**. Read this first; deeper
material lives in [`docs/`](docs/).

## What this repo is

Everything that powers the **Game On Portugal** Discord community (previously
"Playstation Portugal"): the Discord bot, a cron sidecar that pokes the bot, and
a copy of the community website.

| Path               | What it is                                                    | Alive?                          |
| ------------------ | ------------------------------------------------------------- | ------------------------------- |
| `discord-bot/`     | Current bot. TypeScript + Bun + discord.js v14 + Prisma/MySQL | **Yes** — the only active code  |
| `old-discord-bot/` | Predecessor bot. Node 15 + discord.js v12 + Sequelize         | No — reference only, not built  |
| `scheduler/`       | Chadburn cron container that `docker exec`s bot CLI commands  | Deployed but runs **zero** jobs — to be deleted |
| `webpage/`         | Bootstrap static site for game-on-portugal.pt                 | No — the live site is elsewhere |

Details and the reasoning behind "alive?" are in
[`docs/state-of-the-project.md`](docs/state-of-the-project.md).

## Where it lives

- **Repo**: `github.com/GameOnPortugal/monorepo` (public), default branch `main`.
- **Images**: Docker Hub `joshlopes/game-on-portugal-bot`, `joshlopes/game-on-portugal-scheduler`.
- **Runtime**: **HTZ1** — `ssh -p 2224 ezweb@195.201.192.35`, Portainer stack
  `game-on-portugal` (id `46`, endpoint `3`). The bot is **live**
  (`GameOnPortugalBot#9387`). Moved off TedRelayer, the home media server, on
  **2026-08-19**; TedRelayer stays stopped-but-intact as the rollback path
  until **2026-09-02**.
- **Website**: `game-on-portugal.pt` → GitHub Pages of the *separate*
  `GameOnPortugal/gameonportugal.github.io` repo, **not** `webpage/` here.

> ✅ **Deployment migration done (2026-08-19).** The CapRover workflows
> (targeting *Superman*, decommissioned 2026-06-30) have been replaced with the
> house pipeline: Portainer on **HTZ1** over an SSH tunnel, release-please
> cutting versions on merge. Production now runs there and **merging to `main`
> deploys it**. What is still outstanding — `RELEASE_PLEASE_TOKEN`, Telegram
> secrets, the public apex DNS cutover, the TedRelayer decommission — is
> tracked in [`docs/plans/04-infrastructure-migration.md`](docs/plans/04-infrastructure-migration.md)
> and [`infrastructure/SETUP.md`](infrastructure/SETUP.md).

## Working on `discord-bot/`

Node **≥ 18.18** is required by the Prisma preinstall hook (the system Node on
this machine is 18.16 — use nvm's 24.x, or `bun install` fails).

```bash
cd discord-bot
bun install
bunx prisma generate            # REQUIRED — without it tsc reports ~30 phantom errors
bunx tsc --noEmit               # type check (currently fails, see known-issues)
```

Tests are integration tests against a real MariaDB. The container-based path:

```bash
make up && make db.test.setup && make tests
```

Or against a throwaway DB, without docker-compose:

```bash
docker run -d --name gop-test-mariadb \
  -e MARIADB_ROOT_PASSWORD=rootpassword -e MARIADB_DATABASE=discord_bot_test \
  -p 3399:3306 mariadb:11.7.2
export DATABASE_URL='mysql://root:rootpassword@127.0.0.1:3399/discord_bot_test'
bunx prisma db push --skip-generate
bun test                        # 32 tests, all passing as of 2026-08-19
```

Useful `make` targets: `up`, `down`, `shell`, `tests`, `db.diff NAME=…`,
`db.migrate`, `db.generate`, `db.test.setup`. Note `Makefile` does
`include .env`, so it needs a `.env` to exist (copy `.env.example`).

## Architecture in one paragraph

`discord-bot/` is layered DDD-ish: `Domain/` (entities, value objects,
repository interfaces, zero framework imports) → `Application/` (`Query/` and
`Write/` command objects each paired with a handler) → `Infrastructure/`
(Prisma repositories, discord.js adapters, Inversify wiring) → `Ui/Cli/`
(console commands). Everything is resolved through the single Inversify
container in `src/Infrastructure/DependencyInjection/inversify.config.ts` —
**a new handler, subcommand or repository is not reachable until it is bound
there**. Full walkthrough: [`docs/architecture.md`](docs/architecture.md).

## Conventions that matter

- **Add a feature** = a command/query object + its handler + a DI binding + a
  discord.js subcommand + an integration test under `tests/Integration/…`
  mirroring the `src/` path.
- Handlers are dispatched by constructor name through `CommandHandlerManager`;
  slash commands by `getName()` through `BotExecutor`.
- IDs are value objects extending `AbstractStringVo` (`AdId`, `ScreenshotId`, …),
  never bare strings crossing a layer boundary.
- Prisma column names are snake_case and `@@map`ped to legacy Sequelize table
  names — do not "tidy" them, the production database predates this codebase.
- Mixed style in the tree: `Domain/`/`Infrastructure/` mostly 4-space + no
  semicolons-optional, `Application/` mostly 2-space. Match the file you edit;
  there is no linter to arbitrate.

## Traps

- `bunx prisma generate` before *any* type checking, or you will chase errors
  that do not exist.
- `DISCORD_TOKEN` unset ⇒ the container binds `InMemoryClient` instead of
  `DiscordBot` (`inversify.config.ts`). This is why tests run without Discord,
  and also why a mis-scoped env silently produces a bot that does nothing.
- Discord channel and emoji IDs are **hardcoded** in
  `src/Infrastructure/Community/Discord/DiscordChannels.ts` and `DiscordEmoji.ts`.
- `.env.example` is stale: it advertises `REDIS_DSN`, `SENTRY_DSN`,
  `TROPHY_WEBHOOK`, `TELEGRAM_ACCESS_TOKEN` (none used) and omits `LOKI_HOST` /
  `LOKI_AUTH` (both used).
- The `scheduler/` directory is **not** what is deployed — the running image
  predates it and has every job commented out. Verify inside the container, not
  in the repo. It is slated for deletion (plan 02).

## Before you claim done

`bun run typecheck && bun test` (typecheck runs `prisma generate` first) — and if
you touched `prisma/schema.prisma`, generate a migration (`make db.diff NAME=…`),
because the production entrypoint runs `prisma migrate deploy` on every boot.

CI now enforces the type check, so a PR that does not compile cannot merge. PR
**titles** are linted as Conventional Commits and become the squash commit that
release-please reads — use `feat(marketplace): …` / `fix(bot): …`, not `chore:`,
or your change will never be released.

## Current state & priorities

The repo has been dormant since **2025-06-30**, but the bot is **still serving
the community** and its data is intact (4,971 trophies, 624 screenshots, 70 ads).
Three things are actually broken in production right now:

1. **`/marketplace sell` half-fails on every use** — the ad saves, but the
   message-ID write-back throws. 28 of the 33 ads created since the rewrite have
   an empty `message_id`.
2. **The scheduler runs zero jobs** — the deployed image predates the commit that
   enabled the weekly screenshot winner, so that feature has never once run.
3. **`schema.prisma` has drifted from its own migrations**, so the test database
   and production have different shapes.

Plus the accumulated rot: 6 type errors, no linter, no release ever cut. See
[`docs/known-issues.md`](docs/known-issues.md) for the itemised list (25 items)
and [`docs/revival-plan.md`](docs/revival-plan.md) for the order to attack it in.

**If you are an agent picking up work**, start at
[`docs/plans/GLOBAL-PLAN.md`](docs/plans/GLOBAL-PLAN.md) — the master work queue.
It sequences every known defect and gap into numbered work items (`M0.1`, `M4.7`,
…) across ten milestones, says what blocks what, and traces each item back to the
evidence for it. Then read
[`docs/plans/00-overview.md`](docs/plans/00-overview.md) for the shared context
(brand assets, the real state of the data, settled decisions) that every plan
assumes you have.
