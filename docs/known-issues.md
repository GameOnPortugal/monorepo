# Known issues

Everything here was reproduced on **2026-08-19** against commit `31f6699` and
against the **live production deployment** on TedRelayer, not inferred from
reading. Severity is about risk to the running community bot, not about tidiness.

> **This list is not the whole picture.** A second audit pass — security,
> correctness and Discord-API practice — produced findings that are *not*
> numbered here, including two that belong in the 🔴 band:
>
> - **Mention injection (A1)** — `SellSubcommand` concatenates user-supplied text
>   into message *content* and nothing sets `allowedMentions`, so an ad named
>   `@everyone` makes the bot ping the server. Live exposure, today.
> - **`/trophy rank` ranks the wrong people (B1)** — `OrmTrophyRepository` applies
>   `take: limit` in the Prisma query *before* points are summed and sorted in JS,
>   with no `orderBy`. "Top 10" is an arbitrary 10 profiles sorted among
>   themselves. Affects all three rank modes and `findUserPosition`.
>
> Those live in [`plans/05-bot-audit-and-hardening.md`](plans/05-bot-audit-and-hardening.md)
> (A1–A8, B1–B10, C1–C7), with the Discord-API and dependency detail in
> [`06`](plans/06-discord-api-modernisation.md) and
> [`07`](plans/07-dependency-upgrades.md). **Everything from all four documents is
> sequenced together in [`plans/GLOBAL-PLAN.md`](plans/GLOBAL-PLAN.md)** — read
> that to know what to do next.

## 🔴 High

### 0. `/marketplace sell` fails on every single use, in production, today

`SellSubcommand.handle()` creates the ad, posts the listing message, and then
tries to write the Discord message ID back:

```ts
const ad = await this.commandHandlerManager.handle(command);   // ← returns undefined
...
const updateCommand = new CreateAd(ad.id, ...)                 // ← TypeError
```

`CreateAdHandler.handle()` is declared `Promise<void>` and returns nothing, so
`ad` is always `undefined`. Production log:

```
TypeError: undefined is not an object (evaluating 'ad.id')
    at SellSubcommand.ts:86:17
```

The `catch` then calls `interaction.reply()` a second time — the first reply
already went out at line 79 — producing a cascading
`InteractionAlreadyReplied` error. Every `Ad created successfully` line in the
production log is immediately followed by `Error creating sale listing`; the
failure rate is **100%**.

**Impact, measured against production data.** The ad is created with
`message_id = ''` (a placeholder the write-back was supposed to replace):

| Ads                                     | Count |
| --------------------------------------- | ----- |
| Total                                   | 70    |
| Created since the rewrite (2025-04+)    | 33    |
| …of those, with `message_id = ''`       | **28** |
| Legacy ads (old bot) with a real ID     | 42    |

So 28 ads are permanently orphaned from their Discord message. Anything keyed on
that message — the un-ported `has-been-sold` cleanup job, reaction tracking, any
future "bump"/"sold" flow — cannot work for them. The user sees their listing
posted and nothing else, so it has gone unreported for over a year.

**Fix**: make `CreateAdHandler.handle()` return the `Ad` (and widen
`CommandHandler<CreateAd>`), or have `SellSubcommand` keep the `AdId` it already
generated at line 49 instead of expecting one back. The second is a one-line
change and does not alter the handler contract. Either way, also move the
`catch`'s reply to `followUp()` when `interaction.replied` is true. This is
exactly the untested layer described in issue #14.

### 1. Prisma schema has drifted from its own migrations — ✅ FIXED

`schema.prisma` declares `Ad.state`, `Ad.price` and `Ad.zone` as **non-nullable**.
The only migration that creates the `ads` table declares all three **nullable**,
and no later migration changes them. Confirmed with `prisma migrate diff`:

```sql
-- AlterTable
ALTER TABLE `ads` MODIFY `state` VARCHAR(191) NOT NULL,
    MODIFY `price` VARCHAR(191) NOT NULL,
    MODIFY `zone`  VARCHAR(191) NOT NULL;
```

This matters because the two environments take different paths to a schema:

- **Tests** run `prisma db push`, which applies `schema.prisma` directly → columns
  are `NOT NULL`.
- **Production** runs `prisma migrate deploy` in `entrypoint.sh` → columns stay
  nullable.

So the test database does not have the same shape as production, and the
generated client's types describe neither reliably. **Confirmed against the live
database**: `information_schema` reports `state`, `price` and `zone` as
`IS_NULLABLE = YES` in production, and `_prisma_migrations` holds 2 rows with
"No pending migrations to apply" — production is faithfully following the
migrations while the schema file says something else.

The legacy Sequelize model (`old-discord-bot/src/models/ad.js`) had all three
nullable, which confirms the migrations are right and `schema.prisma` is the
accidental change. Good news for the fix: no production row currently holds
`NULL` in any of the three columns (checked), so either direction is safe today —
but that is luck, not design.

**Fixed** 2026-08-19: `state`, `price` and `zone` relaxed to `String?` in
`schema.prisma`, matching the migrations, production and the legacy Sequelize
model. **No migration was needed** — the database columns were already nullable;
only the schema file disagreed. `prisma migrate diff` now reports an empty
migration, and `prisma db push` (tests) and `prisma migrate deploy` (production)
finally produce the same shape.

### 2. CI deploys to a machine that no longer exists — ✅ FIXED

Both `bot.yaml` and `scheduler.yaml` deployed via `caprover/deploy-from-github`
to the CapRover host *Superman*, whose Hetzner contract was cancelled on
**2026-06-30**. The stack was hand-migrated to TedRelayer
(`~/game-on-portugal/`, docker-compose) and the repo was never updated, so
merging to `main` built an image and then failed to deploy it.

**Fixed** 2026-08-19: the nine CapRover-era workflows were replaced with the
house pipeline (Portainer over an SSH tunnel to HTZ1) — see
[`plans/04-infrastructure-migration.md`](plans/04-infrastructure-migration.md)
and `infrastructure/SETUP.md`. Phases 0–3 of that plan have now executed:
credentials created, the Portainer stack built (id 46) and restored, and
production cut over from TedRelayer to HTZ1 with ~2 minutes of downtime.
`deploy.yml`'s `push` trigger is enabled — **merging to `main` deploys for
real**. The old `CAPROVER_*` secrets were deleted; `MY_RELEASE_PLEASE_TOKEN`
was left in place even though nothing reads it (see issue #6). Remaining gap:
`RELEASE_PLEASE_TOKEN` was not created (see #6), and the Telegram notification
secrets are still unset, so `deploy.yml` runs without a Telegram ping today.

### 3. The scheduler has never run a single job

`docker exec game-on-portugal-scheduler cat /srv/config.ini` shows **every job
commented out**, including a `weekly-screenshot-winner` still pointing at the old
bot's `node scripts/screenshot-winners.js`. The repo's `config.ini` has had the
job enabled since commit `c28a73f` (2025-04-20 09:56) — but
`joshlopes/game-on-portugal-scheduler:latest` was last pushed **2025-04-19
14:27**, seventeen hours earlier. The image was never rebuilt.

The scheduler container's logs contain nothing but the `update-container-id`
supervisord loop firing every two minutes. The weekly screenshot winner — the
sole reason this component exists, and the feature commit `c28a73f` was written
to ship — **has never executed in production**.

Worth checking *why* the rebuild never happened before trusting the pipeline
again: `scheduler.yaml`'s `push` trigger mixes `paths`, `branches` and `tags`,
and commit `c28a73f` did touch `scheduler/config.ini`, so it should have fired.

**Fix**: rebuild and redeploy the scheduler image. Then verify inside the
container rather than in the repo — this failure mode is invisible from the
source tree.

## 🟠 Medium

### 4. `bunx tsc --noEmit` fails — 6 errors — ✅ FIXED

Historically CI never caught this: the static-analysis job in the old
`bot.yaml` was commented out, and `bun test` transpiles without type checking.
**The new `ci.yml` runs `bunx prisma generate && bunx tsc --noEmit` as a required
step**, so these six must be fixed before anything else can merge — see
[`plans/01-marketplace-overhaul.md`](plans/01-marketplace-overhaul.md) task 1.

| Location                                     | Error                                                     |
| -------------------------------------------- | --------------------------------------------------------- |
| `DeleteAdSubcommand.ts:32`                   | `ads[position].id` — object possibly `undefined` (`noUncheckedIndexedAccess`); bounds are checked but the compiler cannot see it |
| `DeleteAdSubcommand.ts:59`                   | `error.message` on a value of type `unknown`               |
| `OrmAdRepository.ts:24,25` (update branch)   | `string \| null` not assignable to `price` / `zone`        |
| `OrmAdRepository.ts:39,40` (create branch)   | `string \| null` not assignable to `price` / `zone`        |

**Fixed** 2026-08-19, all six. The last four dissolved with issue #1. The two in
`DeleteAdSubcommand.ts` were fixed directly: look the ad up and guard on
`undefined` rather than bounds-check then index (`noUncheckedIndexedAccess`
cannot see the guard), and narrow the caught `unknown` with `instanceof Error`.
`bun run typecheck` is now clean and `ci.yml` enforces it.

Note that **you must run `bunx prisma generate` first** or you will instead see
~30 spurious `implicitly has an 'any' type` errors from the missing client — the
`typecheck` script does this for you.

### 5. Nothing gates code quality — 🔸 partly addressed

Type checking and security scanning are now in CI (`ci.yml`, `security.yml`), and
PR titles are linted as Conventional Commits (`pr-title.yml`). Still missing:
**no ESLint, no Prettier**. `old-discord-bot/` has an
`.eslintrc.json`; the rewrite dropped it. Source files carry
`// eslint-disable-next-line @typescript-eslint/...` comments referencing rules
no configured linter enforces. Style is visibly inconsistent — 4-space and
2-space indentation, semicolons and no semicolons, sometimes within one
directory.

### 6. release-please has never produced a release — 🔸 repo side fixed, PAT still outstanding

Configured since April 2025, running on every `main` push. Result: **zero tags,
zero GitHub releases**, both manifest entries still `0.0.0`. Two candidate
causes, not mutually exclusive: `MY_RELEASE_PLEASE_TOKEN` is invalid, or the
commit log is almost entirely `chore:`-typed and therefore never triggers a
release. Also, `scheduler` is listed in `.github/release-please-config.json` but
**missing from `.release-please-manifest.json`**, so it could not be released
even if the rest worked.

**Status**: config and manifest moved to `.github/`, reduced to the one component
that actually exists (`discord-bot`), `version` added to its `package.json` (the
`node` release-type requires one), and `pr-title.yml` now enforces Conventional
Commits on the PR title — which is the actual root cause, since PRs are
squash-merged and `chore:` never triggers a release. That part is fixed.

**Still open**: the `RELEASE_PLEASE_TOKEN` PAT was **not created** during the
2026-08-19 infrastructure migration — it cannot be minted non-interactively.
`release-please.yml` falls back to `secrets.GITHUB_TOKEN`, which lets it open
and update release PRs, but PRs opened with the default token do not trigger
downstream workflows (CI, and therefore the deploy that would run on merging
the release PR). `MY_RELEASE_PLEASE_TOKEN` still exists as a secret but is not
read by the current workflow — safe to delete once `RELEASE_PLEASE_TOKEN` is
minted. Until then, expect a release PR to open on the next `feat:`/`fix:`
merge, but treat its own merge as needing a manual deploy trigger
(`workflow_dispatch`) if CI did not visibly run on it.

### 7. Dependencies are ~14 months stale

Every runtime dependency is behind; the notable ones:

| Package        | Current | Latest  |
| -------------- | ------- | ------- |
| `@prisma/client` / `prisma` | 6.6.0 | 7.9.1 (major) |
| `discord.js`   | 14.18.0 | 14.27.0 |
| `inversify`    | 7.5.0   | 8.2.3 (major)  |
| `uuid`         | 11.1.0  | 14.0.2 (major) |
| `axios`        | 1.8.4   | 1.19.0  |
| `typescript`   | 5.8.3   | 5.9.3   |

Discord regularly deprecates and eventually removes API behaviour; a bot pinned
to a 14-month-old library version is the most likely source of a silent future
breakage.

### 8. `.env.example` describes a bot that no longer exists

It advertises `REDIS_DSN`, `SENTRY_DSN`, `TROPHY_WEBHOOK` and
`TELEGRAM_ACCESS_TOKEN` — **none** of which appear anywhere in `discord-bot/src`
— while omitting `LOKI_HOST` and `LOKI_AUTH`, which are used. It also gives
`DATABASE_URL` a host (`db`) that matches no service in either compose file
(the service is `mariadb`). Since `Makefile` does `include .env`, this is the
first file a new contributor copies, and it is wrong in three ways.

### 9. `webpage/` is deployed by nothing

`game-on-portugal.pt` is served by GitHub Pages from the separate
`GameOnPortugal/gameonportugal.github.io` repo. This directory has a matching
`CNAME` and appears in the release-please config and labeler, but no workflow
builds or publishes it, and this repo has no Pages site. Editing it changes
nothing. Its Unsplash background URL
(`source.unsplash.com/featured/…`) points at a service Unsplash retired, so that
is broken wherever it *is* served. Its `forms/` directory contains PHP that
nothing executes.

### 10. The trophy feature has been ranking stale data since December 2024

`/trophy check` and `/trophy rank` work, but nothing has written to the
`trophies` table since **2024-12-02** — the psnprofiles.com scraper that feeds
it lives only in `old-discord-bot/scripts/parse-psn-profile.js` and was never
ported. Production holds 4,971 trophies across 118 profiles, all frozen. Users
are being shown a leaderboard that has not moved in twenty months, with no
indication that it is stale.

This is the highest-value gap in the port, because the feature *appears* to work.

## 🟡 Low

### 11. `entrypoint.sh` prints the database password to stdout

The connection-retry message interpolates the parsed credentials:

```
Trying to connect to MariaDB... (game-on-portugal-db:3306) with user root and password <redacted>
```

It is the first line of every container start, so the root password sits in
`docker logs` in plaintext. Anyone who can read logs — or receives a pasted log
excerpt — has the database. It also means enabling `LOKI_HOST` would ship the
password to Grafana Cloud. Drop the password from the message.

### 12. `entrypoint.sh` waits for the database forever

The readiness loop has no attempt limit. A wrong `DATABASE_URL` yields a
container that prints `Waiting for MariaDB...` indefinitely instead of failing —
so orchestrator restart/alerting never fires. The URL is also parsed with
positional `cut`, so a password containing `:` or `@` breaks it silently.

### 13. Deprecated APIs

- `ephemeral: true` is used in 7 places (`DeleteAdSubcommand.ts`,
  `MarketplaceSlashCommand.ts`); discord.js deprecated it in favour of
  `flags: MessageFlags.Ephemeral`, which `DiscordBot.ts` already uses elsewhere.
- `shared.build-image.yaml` uses `::set-output`, deprecated by GitHub since 2022.
- `prisma/schema.prisma` has no generator `output` path — a hard requirement in
  Prisma 7.

### 14. The discord.js layer has no tests

32 integration tests cover application handlers and repositories. The
discord.js adapters — argument parsing, error mapping, replies — have none.
Both merged PRs (#1, #2) fixed bugs in exactly that layer.

### 15. `registerSlashCommands` swallows failures

It catches, `console.error`s (bypassing the injected logger, so nothing reaches
Loki) and continues. A failed registration therefore produces a running bot with
no commands and no alert.

### 16. Hardcoded Discord IDs

Channel and emoji snowflakes are compile-time enums in
`Infrastructure/Community/Discord/`. Only one channel is mapped (`SCREENSHOTS`).
Any channel change needs a code change, image rebuild and redeploy.

### 17. Small dead ends

- `package.json` has `test:local` pointing at `.env.local`, a file that does not
  exist and is documented nowhere.
- `Makefile` has `create-user`, `console-command` and `db-seed` targets invoking
  `ts-node` (not a dependency) or `prisma db seed` (no seed script configured).
- `RetryAxiosHttpClient` is bound and wired but nothing calls it.
- Seven Prisma models (`LFGProfile`, `LFGGame`, `LFGParticipation`, `LFGEvent`,
  `StockUrls`, `SpecialChannel`, `CommandChannelLink`) have no repository and no
  consumer.
- `README.md` in `discord-bot/` is still the unedited `bun init` boilerplate,
  instructing you to run a file (`index.ts`) that does not exist at that path.

## Second batch — found while planning the marketplace and portal (2026-08-19)

Numbered from 18 to avoid renumbering the list above. Severity is marked
per-item; two of these are 🔴.

### 18. 🔴 Screenshots store the wrong message ID, so the weekly winner can never work

`CreateScreenshotSubcommand` persists the screenshot **before** replying and
passes `interaction.id` — the interaction's snowflake — as `message_id`:

```ts
new CreateScreenshot(screenshotId, name, interaction.user.id,
    interaction.channelId,
    interaction.id,        // ← not the posted message's ID
    platform, image.url)
```

`GetScreenshotWinnerHandler` then fetches that ID as a message, gets
`Unknown Message`, catches per-screenshot, and ends with `winner = null`. So even
after the scheduler is fixed (issue #3), the weekly winner announces nothing —
**every week, forever**. Verified: stored `1511065198885212340` does not resolve;
the real message is `1511065203364860014`.

Same root cause as issue #0: storing a placeholder or the wrong reference instead
of the ID of the message actually posted.

**Recoverable.** The real messages exist in `🖼screenshots`, carry `plat`
reactions with real counts, and embed the screenshot UUID in their content
(`ID: #019e8451-dbe7-…`), so rows can be matched deterministically. See
[`plans/02-scheduler-and-lifecycle.md`](plans/02-scheduler-and-lifecycle.md).

### 19. 🔴 Every stored screenshot image URL is dead

All **624** rows 404. 614 are plain `cdn.discordapp.com/attachments/…` (written
by the old bot, before Discord required signed URLs) and 10 are
`ephemeral-attachments/…` with expired signatures. The bot stores
`image.url` — the *uploaded attachment's* signed CDN URL — at submit time, and
Discord expires those within 24 hours.

Consequence: the gallery the portal is meant to showcase currently has no
images. Fix is to re-host at ingest and to backfill from the messages (issue #18).

### 20. 🟠 Ads are posted into whichever channel the command was typed in

`SellSubcommand` uses `interaction.reply()`, so the listing lands wherever the
member ran it, and `channel_id` records that. Five ads are sitting in `💬chat`
and three in a third channel, instead of `📖anuncios`. The old bot always posted
to the marketplace channel.

### 21. 🟠 Deleting an ad leaves its message in the channel forever

`DeleteAdHandler` deletes the row only. The old bot's `AdManager.delete` removed
the Discord message first and then the row. `📖anuncios` is therefore
accumulating listings for ads that no longer exist, with no way to tell.

### 22. 🟡 `adType` has three values for two concepts

`sell` (35, old bot), `sale` (28, rewrite), `wanted` (7). The rewrite introduced
`sale` for what the old bot called `sell`, and nothing reconciles them.

### 23. 🟡 Free-text columns have degraded into unusable dimensions

Not a bug so much as an absence of validation, but it blocks filtering anywhere:

- `screenshots.plataform`: **21** distinct strings for ~7 platforms (`PS5` 400,
  `PlayStation 5` 75, `PS 5`, `PS`, `Ps Now`, `X box series S`,
  `XBOX SERIE X - 60FPS`, …).
- `ads.zone`: `Lisboa`, `porto`, `Lisbon`, `Braga/Porto`, `Digital`,
  `não se aplica`, and `PlayStation 4/5` — someone answering the wrong question.
- `ads.state`: enum values and free Portuguese text in the same column.
- `ads.price`: `145`, `65`, `50€` — no currency discipline.

### 24. 🟡 The rewrite dropped Portuguese

The old bot spoke Portuguese throughout ("Qual o nome do artigo?", "VENDO",
"Preço", "Zona", "Envio", "Garantia"). Every user-facing string in the rewrite is
English, in a community whose members post in Portuguese. This is a UX regression
that arrived with the rewrite and has never been raised.

## Third batch — found during the HTZ1 infrastructure migration (2026-08-19)

### 25. 🔴 The nightly database backup had been silently failing to upload for seven weeks — ✅ FIXED

Found while re-verifying the `databack/mysql-backup` sidecar on TedRelayer as
phase 0, step 3 of [`plans/04-infrastructure-migration.md`](plans/04-infrastructure-migration.md)
("nobody has ever checked"). The last file actually present on the NAS was
dated **2026-06-30** — the day of the Superman→TedRelayer migration — even
though the container had been reporting `Up` for seven weeks since.

The dump itself succeeded every night; it was the SMB **upload** that failed,
with `protocol negotiation failed: NT_STATUS_CONNECTION_DISCONNECTED`. Root
cause: `DB_DUMP_TARGET` addressed the NAS over the internet via the DDNS name
`joshlopes.synology.me`, when TedRelayer and the NAS are in fact on the same
LAN. Fixed by repointing it at the LAN address `192.168.0.178` and recreating
the container; a backup was produced immediately and verified present on the
NAS.

**The general lesson, worth not relearning**: the backup had never once been
checked end-to-end, and "the container is `Up`" was never evidence that it was
actually producing restorable, delivered backups — only that the process
hadn't crashed. The same applies to `gop-db-backup` on the new HTZ1 stack: its
existence in `docker ps` is not verification either. Spot-check it periodically
rather than assuming.

## Verified *not* broken

Worth recording, so nobody re-investigates:

- **`bun test`** — 32 pass / 0 fail against MariaDB 11.7.2.
- **Production Docker build** — `docker build --target runtime --build-arg
  APP_ENV=prod` succeeds cleanly. The odd-looking `COPY ../ .` in the Dockerfile
  does work as written.
- **`BotExecutor`'s `@multiInject(TYPES.MentionHandler)`** — has zero bindings,
  which *looks* like a boot-time crash waiting to happen. Inversify 7 returns an
  empty array; resolving `BotExecutor` succeeds and reports all four slash
  commands. Confirmed by probe, not by reasoning.
- **GitHub Actions** — enabled, all nine workflows active. The empty run history
  reflects dormancy, not a disabled pipeline.
- **The bot itself** — live on TedRelayer, up 6 weeks, `Ready! Logged in as
  GameOnPortugalBot#9387`, 4 slash commands registered, migrations applied
  cleanly at boot.
- **Production data** — intact: 4,971 trophies, 624 screenshots, 118 trophy
  profiles, 70 ads, with a nightly `databack/mysql-backup` job that *appeared*
  to be writing to the NAS — turned out not to be (see issue #25, found and
  fixed later the same day). `/marketplace` is still being used (newest ad
  2026-08-06) and `/screenshot` too (newest 2026-06-01).
- **LFG data** — the LFG tables are **empty**, not lost-and-recoverable. Do not
  plan a migration for them; there is nothing to migrate.

## Noted but not classified

- `@discordjs/ws` throws `TypeError: error is not an Object. (evaluating '"code"
  in error')` in its own `onError` handler at boot. It is a library-internal
  mis-handling of a non-`Error` rejection, harmless in that the bot connects
  anyway, and most likely fixed by the discord.js bump in issue #7.
- The production compose file passes `REDIS_DSN`, `SENTRY_DSN`,
  `TELEGRAM_ACCESS_TOKEN` and `TROPHY_WEBHOOK` into the container, and runs a
  whole `redis:7.0.4` container, for code that reads none of them. It was
  written from the stale `.env.example` (issue #8). Removing Redis would free a
  container and reduce confusion.
