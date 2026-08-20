# The Global Plan

**One ordered route from "dormant repo with three live production failures" to
"a maintained, modern, Portuguese community platform".**

Written 2026-08-19. This is the **master work queue**. Every other document in
`docs/` is either evidence (what is broken, and how we know) or detail (how one
area should be built). This file is the only place that says **what to do next
and in what order**, and it is the file to update as things land.

---

## How to use this document

- **Work item IDs are stable** (`M4.7`, `M6.3`, …). Put the ID in the PR title
  scope or body so the ledger can be updated without archaeology.
- **One work item = one PR**, unless the item says otherwise. Items are sized so
  a reviewer can hold the whole change in their head.
- **Every item names its evidence** — the issue number, plan section or code
  location that justifies it. If the evidence turns out to be wrong, fix the
  evidence document too, don't just skip the item.
- **Milestones are ordered, items inside a milestone mostly are not.** Where an
  item genuinely blocks another it says so.
- **Nothing here is a suggestion to skip tests.** The reason this repo
  accumulated fourteen months of invisible breakage is that the layer where all
  the bugs live has no tests at all.
- **Read [Standing instructions from Luis](#standing-instructions-from-luis)
  before you pick an item up.** It says which item is closed to discussion (LFG)
  and how much latitude you have on every other one (a lot).

### Definition of done, for every item

```bash
cd discord-bot
bunx prisma generate          # or the typecheck script, which does it for you
bun run typecheck             # must be clean
bun test                      # must be green
```

Plus: a test that would have caught the bug, a Conventional-Commit PR title with
a scope (`fix(marketplace): …`, `feat(trophies): …` — **not** `chore:`, which cuts
no release), and a migration (`make db.diff NAME=…`) if `schema.prisma` changed,
because the production entrypoint runs `prisma migrate deploy` on every boot.

The scope is **validated by CI** (`.github/workflows/pr-title.yml`) against a
closed list, so a plausible-looking scope that is not on it fails the PR:

```
bot  marketplace  screenshots  trophies  media  scheduler
portal  portal-api  portal-web  db  ci  docker  infra  deps  deps-dev
```

Note `trophies`, not `trophy`. If a genuinely new area appears, add it to that
workflow in the same PR rather than picking the nearest existing scope.

### Where the evidence lives

| Document | What it holds |
| -------- | ------------- |
| [`../known-issues.md`](../known-issues.md) | Itemised defects **#0–#24**, reproduced against production |
| [`../discord-bot-feature-gap.md`](../discord-bot-feature-gap.md) | Everything the old bot did that the rewrite does not — rows **G1–G25** |
| [`05-bot-audit-and-hardening.md`](05-bot-audit-and-hardening.md) | Security **A1–A8**, correctness **B1–B10**, API **C1–C7** |
| [`06-discord-api-modernisation.md`](06-discord-api-modernisation.md) | Deprecations **P1–P5**, interaction lifecycle, components |
| [`07-dependency-upgrades.md`](07-dependency-upgrades.md) | Locked inventory, hygiene defects **D1–D5**, Prisma 6→7 |
| [`01`](01-marketplace-overhaul.md) [`02`](02-scheduler-and-lifecycle.md) [`03`](03-portal.md) [`04`](04-infrastructure-migration.md) | Per-area designs and task tables, all open questions already decided |
| [`../session-log-2026-08-19.md`](../session-log-2026-08-19.md) | How we found all of this, and the decision log |

---

## The situation in five lines

The bot is **live** and serving a real community (4,971 trophies, 624
screenshots, 70 ads) and has been since April 2025. In that time
`/marketplace sell` has failed on **100%** of invocations, the scheduler has run
**zero** jobs, every one of the 624 stored screenshot images has **404**'d,
`/trophy rank` has been ranking an arbitrary subset of profiles against a
leaderboard **frozen since December 2024**, and any member could make the bot
`@everyone` the server by naming an item `@everyone`. None of it was reported,
because the project has no feedback loop: no type gate ran, no linter existed, no
release was ever cut, and the discord.js layer — where every single one of those
bugs lives — has **no tests**.

So the ordering principle is: **stop the bleeding → restore the signal → make
deployment real → modernise → build.** Resist starting at M8.

---

## Standing instructions from Luis

Two things that override the wording of any individual work item below.
Restated **2026-08-20**.

### 1. LFG is not moving. Full stop.

**Luis is not interested in moving LFG.** It will not be ported — not in a
reduced form, not "just the profiles", not later. This was decided on
2026-08-19 and reaffirmed on 2026-08-20, and it is not a question anybody
needs to reopen.

Practically: **M9.3** is a *deletion* item, not a porting item — drop
`LfgProfile`, `LfgGame`, `LfgEvent` and `LfgParticipation` and their four
tables (all empty, so there is no data to preserve and no migration risk).
Everything under [§5 of the feature-gap document](../discord-bot-feature-gap.md)
is recorded as history, not as a specification. If a future document, ticket or
agent proposes building LFG, the answer is no; point at this section.

### 2. On every *other* feature, the agent has design latitude

The work items below describe the **outcome** the community should get, not the
implementation an agent is obliged to produce. They were written from a
16-month-old codebase and a bot that predates most of the Discord platform
features that now exist.

So, before implementing any feature item, the agent **must**:

1. **Look at what is actually in the tree today**, not at what the plan assumed
   was there. The plan is evidence-backed, but it is a snapshot, and items have
   been landing against it since 2026-08-19.
2. **Say whether there is a better way to do it now** — a newer Discord
   primitive, a simpler data model, a smaller surface, or simply not building
   it at all.

If the agent has a better idea, it is **free to build the better idea** instead
of the letter of the item. No approval round-trip. Two conditions, both
non-negotiable:

- The **outcome** for the community must be at least as good. Latitude is
  permission to redesign, not permission to descope. If it *is* a descope, that
  is a call for Luis — write it up rather than doing it.
- **Write the decision down.** Update the item in this file (and the relevant
  `0X-*.md` design doc) with what you built instead and *why*, in the same shape
  as the M9.1 AutoMod redesign — that one is the worked example of this rule.

And if an agent evaluates a feature and **decides not to pick it up now**, that
is fine — but it must record, in the item itself: what it found, why it stopped,
and what the next agent should do differently. An item silently skipped is
indistinguishable from an item nobody reached, and that is exactly how this repo
accumulated fourteen months of invisible breakage.

---

## Milestone map

| # | Milestone | Why now | Blocks | Rough size |
| - | --------- | ------- | ------ | ---------- |
| **M0** | [Stop the bleeding](#m0--stop-the-bleeding) | Users are hitting these today | — | 3 PRs, days |
| **M1** | [Restore the signal](#m1--restore-the-signal) | Nothing after this is verifiable without it | M3, M4 | 6 PRs, ~1 week |
| **M2** | [Infrastructure cutover](#m2--infrastructure-cutover) | CI deploys to a machine that no longer exists | M5.11, M6, M8 | Runbook, needs Luis |
| **M3** | [Dependency currency & container hygiene](#m3--dependency-currency--container-hygiene) | 14 months stale; two majors behind | M4 | 8 PRs |
| **M4** | [Discord API modernisation](#m4--discord-api-modernisation) | The enabler for every feature below | M5, M6, M9 | 8 PRs |
| **M5** | [Marketplace overhaul](#m5--marketplace-overhaul) | The most-used feature, in English, half-broken | M6.5 | 11 PRs |
| **M6** | [Jobs, lifecycle & media durability](#m6--jobs-lifecycle--media-durability) | Recovers 624 screenshots; stops ads accumulating forever | M8 | 8 PRs |
| **M7** | [Trophies — make the leaderboard true](#m7--trophies--make-the-leaderboard-true-again) | A shipped feature that silently lies | — | 8 PRs |
| **M8** | [Community portal](#m8--community-portal) | The public face; makes moderation possible without SSH | — | 15 PRs, largest |
| **M9** | [Close the feature gap, retire the dead weight](#m9--close-the-feature-gap-retire-the-dead-weight) | Finish the port so `old-discord-bot/` can die | — | 3 PRs — **LFG and stock alerts dropped, see decisions** |

```
M0 ──▶ M1 ──▶ M3 ──▶ M4 ──┬──▶ M5 ──▶ M6 ──▶ M8
                          └──▶ M9
M2 (parallel, needs Luis) ───────▶ M5.11, M6.2, M8
M7 (parallel after M0.8) ────────────────────▶ M8.9
```

**M2 runs in parallel from day one** — it is mostly credentials and DNS, it needs
Luis specifically, and M5/M6/M8 all eventually need the MinIO bucket it creates.

---

## M0 — Stop the bleeding

**Goal**: nothing the community touches today is silently broken or a security
hole. Ship as two or three small PRs; do not bundle this with refactors.

**Exit criteria**: `/marketplace sell` succeeds and stores a real `message_id`;
no user-supplied string can make the bot mention anyone; no internal error text
reaches a user; `/trophy rank` returns the actual top N; the DB password is not
in `docker logs`.

| ID | Item | Evidence | Notes |
| -- | ---- | -------- | ----- |
| **M0.1** | **Fix `/marketplace sell`.** Adopt post-then-persist: defer → build embed → send to the channel → **one** `CreateAd` write holding the real message ID → `editReply`. | [#0](../known-issues.md), [01 T1](01-marketplace-overhaul.md) | The single highest-value change in this document. Do **not** fix it by making `CreateAdHandler` return the `Ad` — that keeps the partial-failure window that caused the bug. |
| **M0.2** | **`allowedMentions: { parse: [] }`** on the `Client` constructor **and** on every reply that echoes user input. `escapeMarkdown()` where raw content is unavoidable. | A1, [06 §5](06-discord-api-modernisation.md) | Live mass-ping exposure. An ad named `@everyone` pings the server today. |
| **M0.3** | **Fix `reply(string, { flags })`.** Not a valid discord.js v14 signature — the options object is dropped, so these "ephemeral" error messages are posted **publicly**. | B2, P1 — `ScreenshotSlashCommand.ts:106`, `CreateScreenshotSubcommand.ts:28,34` | |
| **M0.4** | **`safeReply()` helper** in `Domain/Bot/`, plus `replied \|\| deferred` guards in every catch block. | B3, P4 | `DiscordBot.ts:41-52` already does it correctly — copy that shape. Fixes the cascading `InteractionAlreadyReplied` that hides the real error. |
| **M0.5** | **Stop leaking `error.message` to users.** Generic message + correlation id to the user, full error to the logger. | A3 — `DeleteAdSubcommand.ts:59` | |
| **M0.6** | **Add `@injectable()` to `DeleteScreenshotSubcommand`.** Verified missing while its four siblings have it. | B4 — `.../Screenshot/DeleteScreenshotSubcommand.ts:12` | Confirmed by inspection 2026-08-19. Bound `.toSelf()`, so verify resolution at container build. |
| **M0.7** | **`entrypoint.sh` hygiene**: stop printing the DB password; bound the readiness loop so a bad URL fails instead of hanging forever; parse `DATABASE_URL` properly instead of positional `cut`. | [#11](../known-issues.md), [#12](../known-issues.md) | Do this **before** anyone enables `LOKI_HOST`, or the password ships to Grafana Cloud. |
| **M0.8** | **Fix `/trophy rank` correctness.** `take: limit` is applied in the Prisma query **before** points are summed and sorted in JS, so "top 10" is an arbitrary 10 profiles sorted among themselves. Aggregate and order in SQL. | B1 — `OrmTrophyRepository.ts:104,137,170` | Verified 2026-08-19: no `orderBy` on the query, `.sort()` happens after `take`. Affects all three rank modes **and** `findUserPosition`, which pulls 1000 profiles with all their trophies to index-search. |
| **M0.9** | **Regression tests for M0.1–M0.4** in the discord.js layer. Hand-rolled fake interaction; assert on what the subcommand *sends*. | [#14](../known-issues.md), [01 T12](01-marketplace-overhaul.md) | The first brick of the safety net. Expands into M1.2. |

> **If you only do one thing**: M0.1. One-file change, failing for real users
> every day for sixteen months, and the test you write for it is the foundation
> of everything else.

---

## M1 — Restore the signal

**Goal**: make it impossible for a regression of this class to go unnoticed
again. Cheap, self-contained, and it makes every later milestone verifiable.

**Exit criteria**: CI runs typecheck + lint + tests + `bun audit` + schema-drift
check on every PR; the discord.js layer has a real test harness; a missing env
var fails the boot loudly instead of producing a silent do-nothing bot.

| ID | Item | Evidence | Notes |
| -- | ---- | -------- | ----- |
| **M1.1** | **ESLint + Prettier**, wired into CI, tree formatted in one commit. | [#5](../known-issues.md) | Source files carry `// eslint-disable-next-line` comments for rules no configured linter enforces. Style is 4-space *and* 2-space, semicolons *and* not, sometimes in one directory. Pick one; the formatter arbitrates. |
| **M1.2** | **Discord-layer test harness** — a fake interaction object and a suite covering every subcommand path. | [#14](../known-issues.md), [01 T12](01-marketplace-overhaul.md) | No mocking library needed and none should be added. Both merged bugfix PRs (#1, #2) and all three live bugs are in this layer. |
| **M1.3** | **Env validation at boot** (zod or typebox). Exit non-zero on a missing required var; delete the three `?? ''` token fallbacks. | A6 | Today an unset `DISCORD_TOKEN` silently binds `InMemoryClient` and you get a bot that does nothing. |
| **M1.4** | **`registerSlashCommands` fails loudly** — through the injected `Logger`, not `console.error`, and fatally rather than starting with a stale command set. | [#15](../known-issues.md), C3 | |
| **M1.5** | **Schema-drift gate**: `prisma migrate diff --exit-code` in CI, and switch test setup from `db push` to `migrate deploy` so tests take production's path. | [#1](../known-issues.md), revival plan item 17 | The drift itself is fixed; this stops it recurring. |
| **M1.6** | **Fix `.env.example`** and regenerate the production compose file from it — dropping the Redis container and the four env vars nothing reads. | [#8](../known-issues.md) | It advertises `REDIS_DSN` / `SENTRY_DSN` / `TROPHY_WEBHOOK` / `TELEGRAM_ACCESS_TOKEN` (all unused), omits `LOKI_HOST` / `LOKI_AUTH` (both used), and gives `DATABASE_URL` a host matching no service. `Makefile` does `include .env`, so it is the first thing a contributor copies. |
| **M1.7** | **Externalise the hardcoded Discord IDs** to config. Add `MARKETPLACE` (`📖anuncios`), and the four LFG channels while you are in there. | [#16](../known-issues.md), [G5.5](../discord-bot-feature-gap.md) | Only `SCREENSHOTS` is mapped today; any channel change means a code change, image rebuild and redeploy. **The trophy emoji IDs are verified correct — do not "fix" them.** |
| **M1.8** | ✅ **Clear the dead ends**: `test:local` → a file that does not exist; Makefile `create-user` / `console-command` / `db-seed` targets invoking `ts-node` (not a dependency) or a seed script that is not configured; `discord-bot/README.md` is unedited `bun init` boilerplate; decide the fate of the bound-but-uncalled `RetryAxiosHttpClient`. | [#17](../known-issues.md) | **Done.** `test:local` and `db-seed` removed (no `.env.local` / no seed script ever existed); `create-user` removed (no such console command is registered); `console-command` repaired to call the real `bun run:command` entry point instead of the nonexistent `ts-node`; README rewritten; `RetryAxiosHttpClient` kept, with a comment pointing at M7.1. Also fixed in the same PR: `AxiosHttpClient` was disabling TLS certificate validation on a live path (`TYPES.HttpClient` → `RetryAxiosHttpClient` → `AxiosHttpClient`, used by `CreateScreenshotHandler`'s attachment download since April 2025) — new finding A9 in [05](05-bot-audit-and-hardening.md), cross-referenced with M4.9. |
| **M1.9** | **Supply-chain gates**: `bun audit` failing on high/critical, plus Renovate or Dependabot **grouped** (weekly patches in one PR, majors separate, `discord.js` in its own group). | A7, [07 step 2](07-dependency-upgrades.md) | Without this, M3 becomes a one-off project that has to be repeated in 2027. |
| **M1.10** | **Permission model.** A `ManageMessages`-based admin check plus guild-only contexts. | A2, [G19/§7.3](../discord-bot-feature-gap.md), [01 decision 4](01-marketplace-overhaul.md) | Small, and it **unblocks** M5.10, M9.1 and M9.3. Keys off the guild permission, not a role ID — no config to drift. Every command is invokable by every member in every channel today, including DMs, where `ListAdsSubcommand` builds links with `guildId === null`. |

---

## M2 — Infrastructure cutover

**Goal**: merging to `main` actually changes production. Runs in parallel with
everything else and is the one milestone that **needs Luis specifically** —
credentials, DNS and production access.

The repo side is **already built and lint-clean**: eight workflows, the
`portainer-deploy` composite action, release-please config, the Portainer stack
file and the Caddy vhosts. What remains is a runbook, written out step by step in
[`04-infrastructure-migration.md`](04-infrastructure-migration.md).

**Exit criteria**: a merge to `main` builds, pushes and rolls the HTZ1 Portainer
stack; release-please cuts a real tagged release; `media.game-on-portugal.pt`
serves a public object.

| ID | Item | Evidence |
| -- | ---- | -------- |
| **M2.1** | ✅ **Done 2026-08-19.** Phase 0 — safety net. Dump production, restore it locally, confirm 4,971 / 624 / 118 / 70 row counts (the previously-quoted 4,477 was an InnoDB estimate). Copy `~/game-on-portugal/.env` into 1Password (**it is the only copy of the bot token, on a home server**). Verify the nightly `databack/mysql-backup` output actually restores — nobody has ever checked. | [04 phase 0](04-infrastructure-migration.md) |
| **M2.2** | **Phase 1 — repo wiring.** Squash-only merges, branch protection requiring `CI`, create `RELEASE_PLEASE_TOKEN` / `DOCKER_*` / `PORTAINER_ACCESS_TOKEN` / `DEPLOY_SSH_*` / `TELEGRAM_*`, delete the obsolete `CAPROVER_*` and `MY_RELEASE_PLEASE_TOKEN`. | [04 phase 1](04-infrastructure-migration.md), [#2](../known-issues.md), [#6](../known-issues.md) |
| **M2.3** | **Phase 2 — HTZ1 prep, no cutover.** Tunnel-only deploy key **appended** to `~ezweb/.ssh/authorized_keys`; create the Portainer stack with a **placeholder `DISCORD_TOKEN`** so it cannot fight the live bot; restore the dump; add only the `media.` DNS record and Caddy vhost. | [04 phase 2](04-infrastructure-migration.md) |
| **M2.4** | **Phase 3 — cutover** (~15 min downtime). Stop the old bot **first** — two bots on one token both receive interactions. Delta dump, real token, verify `/ping`, then re-enable `deploy.yml`'s commented-out `push` trigger and prove the pipeline end to end. | [04 phase 3](04-infrastructure-migration.md) |
| **M2.5** | **Phase 5 — decommission.** Leave the TedRelayer stack stopped-but-intact for two weeks, then remove it keeping one final dump. Update `operations.md`, `AGENT.md` and `remote-hosts.md`. | [04 phase 5](04-infrastructure-migration.md) |
| **M2.6** | **Resolve the two open items**: confirm `DEPLOY_SSH_PORT` (remote-hosts says `2224`, the ez-web SETUP files say `22`), and decide whether the MinIO console should be reachable at all. | [04 open items](04-infrastructure-migration.md) |

> Phase 4 (the `game-on-portugal.pt` apex cutover) is deliberately **not** here —
> it belongs with the portal, as **M8.15**. Do not bundle it with M2.4.

---

## M3 — Dependency currency & container hygiene

**Goal**: nothing more than one minor version behind, on a machine that can be
trusted to install it, in a container that does not run as root.

**Blocked by M1** — without `tsc --noEmit` and a lint gate in CI, a dependency
bump is unverifiable, because the integration tests only cover the Application
layer.

**Exit criteria**: `bun audit` clean; no floating version specs; Prisma 7;
container runs non-root with a working healthcheck.

| ID | Item | Evidence | Notes |
| -- | ---- | -------- | ----- |
| **M3.1** | **Hygiene, no version changes.** Declare `reflect-metadata` (imported for side effects in two files, **absent from `package.json`** — it resolves only because Inversify happens to pull it in). Drop or explicitly wire `dotenv` (declared, never imported; env loading works by accident of Bun auto-loading `.env`). Pin `@types/bun` off `latest`. Move `typescript` out of `peerDependencies` — this is an app. Reconcile the Bun version between the Dockerfile and local dev. | D1–D5 | Verified 2026-08-19: `reflect-metadata` absent, `dotenv` present, `@types/bun: "latest"`, `peerDependencies` block present. Low risk, unblocks the rest. |
| **M3.2** | **discord.js 14.18.0 → latest 14.x**, and **record the resulting `undici` version**. Clear the deprecations in the same PR — newer 14.x warns loudly on both. | [#7](../known-issues.md), [#13](../known-issues.md), C2, P2 (7 sites), P3 (2 sites) | `discord.js` and `@discordjs/rest` pin `undici@6.21.1` **exactly**, so an undici advisory cannot be patched by an override — bumping discord.js is the only supported remedy. That is the standing argument for keeping it current. Note `fetchReply: true` → `withResponse: true` returns an `InteractionCallbackResponse`, **not** a `Message`; the call sites read `.id` off it and need adjusting. |
| **M3.3** | **axios 1.8.4 → latest**, *or* drop it for native `fetch`. | [07 step 4](07-dependency-upgrades.md) | Only two files touch it, both behind the `HttpClient` domain port — which exists precisely so this is a contained decision. Dropping it removes six transitive packages. |
| **M3.4** | **Batch the rest**: inversify, winston, dayjs, uuid. | [#7](../known-issues.md), [07 step 5](07-dependency-upgrades.md) | `dayjs` and `uuid` have exactly one call site each and are both replaceable with stdlib (`crypto.randomUUID()`; date math). |
| **M3.5** | **winston-loki decision** — keep, replace with an HTTP push through the existing `HttpClient`, or drop for stdout scraping. **Fix the label bug regardless**: `LokiLogProvider` tags this bot's logs `job: 'tedcrypto-campaign'`. | [07 step 6](07-dependency-upgrades.md) | It drags in `snappy` (13 prebuilt native binaries) and `protobufjs` for one optional, env-gated log sink. Options b/c remove ~15 packages and all native binaries. |
| **M3.6** | **Prisma 6 → 7, alone, as its own PR.** Migrate the generator block, add the now-required `output` path, regenerate, run the integration suite, and verify a real `migrate deploy` in a throwaway container before merging. | [#7](../known-issues.md), [#13](../known-issues.md), [07 step 7](07-dependency-upgrades.md) | The riskiest single move here. `docker/entrypoint.sh` runs `migrate deploy` at boot and `docker/Dockerfile` runs `generate` at build with `--production` installs — re-verify both. |
| **M3.7** | **`::set-output` → `$GITHUB_OUTPUT`** sweep. | [#13](../known-issues.md) | Deprecated by GitHub since 2022. |
| **M3.8** | **Container hardening**: non-root user, drop `mariadb-client` from the runtime layer, fix the accidental `COPY ../ .`, stop bind-mounting the repo `rw` in dev compose, and add a real `/health` endpoint plus a compose healthcheck. | A8, E | The container `EXPOSE`s 3000 and sets `PORT=3000` and **nothing listens** — so no orchestrator can tell whether the bot is alive. |

---

## M4 — Discord API modernisation

**Goal**: the interaction layer is typed, cannot time out, and can dispatch
components. This is the enabler for M5, M6 and M9 — do not start them first.

The bot is on **API v10, which is current**. There is no version migration here.
What is missing is everything v10 gained after this code was written.

**Exit criteria**: `interaction: any` no longer appears anywhere; no handler can
miss the 3-second deadline; buttons, autocomplete and modals route safely with
server-side authorisation.

| ID | Item | Evidence | Notes |
| -- | ---- | -------- | ----- |
| **M4.1** | **Type the interaction layer.** `SlashCommandContext.interaction` → `ChatInputCommandInteraction`; `builder()` → `SlashCommandBuilder`; introduce a discriminated `InteractionContext` covering chat-input / autocomplete / component / modal. | P5, C7 — `SlashCommandContext.ts:5` | **The enabler.** `interaction: any` is *why* M0.3, M0.4 and the `noUncheckedIndexedAccess` bugs got through review. Typing it converts a class of runtime bugs into compile errors — but only because M1 put `tsc --noEmit` in CI. |
| **M4.2** | **`deferReply()` in every non-trivial handler**, then `editReply()`. | C1, [06 §2](06-discord-api-modernisation.md) | **There is not a single `deferReply()` in the codebase.** Worst offenders: `/screenshot create` downloads and MD5s an attachment inside the 3s window; `/trophy rank` loads up to 1000 profiles with all their trophies; `/marketplace delete` by position runs a query first. Deferring extends the window to 15 minutes. Note the ephemeral decision moves to `deferReply` and cannot be changed later. |
| **M4.3** | **Registration overhaul.** Guild-scoped dev path behind `DISCORD_GUILD_ID`; hash the command set and skip the `PUT` when unchanged; add `setDefaultMemberPermissions`, `setContexts([Guild])` and `setIntegrationTypes`. | C3, C5, [06 §4](06-discord-api-modernisation.md), A2 | Global-only registration means up to an hour of propagation and no dev loop. `setContexts` also fixes commands being invokable in DMs. |
| **M4.4** | **Lifecycle hardening.** `Events.Error` and shard errors, `process.on('unhandledRejection' \| 'uncaughtException')`, and SIGTERM → `client.destroy()` + `prisma.$disconnect()`. | C6, [06 §6](06-discord-api-modernisation.md) | The container is killed today without either, leaving gateway sessions dangling on every redeploy. |
| **M4.5** | **Replace `DiscordGuildClient`'s second gateway client** with a REST-only `@discordjs/rest` client. | A5 | It lazily constructs and `login()`s a *whole second* `Client` on the same token and never destroys it, so the CLI process holds an open gateway session. Nothing it does (`channels.fetch`, `messages.fetch`, `send`) needs a gateway. |
| **M4.6** | **Client configuration**: `makeCache` limits + sweepers (`messages` and `users` are what grow), and wire the REST client's rate-limit and invalid-request events into the `Logger`. | [06 §5–§6](06-discord-api-modernisation.md) | An invalid-request spike is how you learn you are heading for a Cloudflare ban *before* it happens. Keep the intents minimal — `GatewayIntentBits.Guilds` only is correct and should stay that way until M9.1 genuinely needs `MessageContent`. |
| **M4.7** | **Component routing infrastructure.** A `ButtonHandler` interface in `Domain/Bot/`, a `TYPES.ButtonHandler` multi-binding, and dispatch on `isButton()` / `isStringSelectMenu()` / `isModalSubmit()` / `isAutocomplete()` by `customId` prefix (`mkt:sold:<adId>`). | C4, [01 T6](01-marketplace-overhaul.md) | **Always re-check ownership server-side from the row — never trust the `customId`.** Anyone can click anyone's button. `BotExecutor` handles chat-input only today. |
| **M4.8** | **Autocomplete on both delete commands**, filtered to the invoking user's own records. Delete the positional-index hack. | [06 §3d](06-discord-api-modernisation.md) | Best value-to-effort ratio in the whole modernisation. Both commands currently ask the user to **paste a UUID**, with a fragile `/^\d+$/` "the Nth ad" workaround bolted on. Must answer in 3s and cannot be deferred — keep the query indexed. |
| **M4.9** | **Attachment ingest safety**: cap on `image.size` before fetching, a streamed max-bytes limit, an explicit timeout, and a Discord CDN host allowlist. | A4 — `CreateScreenshotHandler.generateMd5FromImageUrl()` | Currently fetches an arbitrary URL into memory with no cap and no timeout beyond axios defaults. |
| **M4.10** | **Output-size safety**: guard embed limits (25 fields, 1024 chars/field, 6000/embed) and add a 2000-char message chunking helper. | B6, [G7.4](../discord-bot-feature-gap.md) | `ListAdsSubcommand` adds one field per ad with **no cap** — a user with 26 listings breaks the command outright. `ListScreenshotSubcommand` caps at 10. Make it consistent. |

---

## M5 — Marketplace overhaul

**Goal**: `/marketplace` is correct, complete, Portuguese and pleasant on a
phone, without losing the 70 ads already in the database.

Full design in [`01-marketplace-overhaul.md`](01-marketplace-overhaul.md), whose
decisions are settled. M0.1 already did its task 1; M1.2 did its task 12.

**Depends on**: M4.7 (buttons), M1.10 (admin check), M2.3 (MinIO, for M5.11).
**M5.3 must land before M5.5–M5.10.**

**Exit criteria**: an ad can be created with photos, browsed, searched, edited,
bumped and marked sold, in Portuguese, with the listing message and the row
staying in sync.

| ID | Item | Evidence |
| -- | ---- | -------- |
| **M5.1** | ✅ **PR open** — **Route ads to `📖anuncios`** via `GuildClient` instead of `interaction.reply()`. `SellSubcommand` now sends the listing through `GuildClient.sendMessage(CommunityChannels.MARKETPLACE, …)`; the interaction reply is now a private, ephemeral confirmation with a link to the posted listing, not the listing itself. Post-then-persist (M0.1) kept its shape — one send, one `CreateAd` write holding the real message id. PR [#35](https://github.com/GameOnPortugal/monorepo/pull/35) open on branch `feat/m5-ad-routing` (2026-08-20) — mark done once merged. | [#20](../known-issues.md), [G2.4](../discord-bot-feature-gap.md), [01 T2](01-marketplace-overhaul.md) |
| **M5.2** | ✅ **PR open** — **Delete removes the Discord message**, tolerating an already-deleted one, and the row is now soft-deleted instead of hard-deleted. **Design decision**: `GuildClient.deleteMessage(channelId, messageId)` takes the ad's own raw stored `channel_id` rather than a `CommunityChannels` member like `sendMessage`/`getMessageUrl` do — those target one well-known channel this bot manages, but per issue #20 eight production ads live somewhere other than the marketplace channel, and routing delete only through `CommunityChannels.MARKETPLACE` would silently no-op for exactly those rows. Using the row's own `channel_id` cleans up all 70 ads, not just the ones created after this PR. `DiscordGuildClient.deleteMessage` catches Discord's `UnknownMessage`/404 and treats it as success; rows with an empty `message_id` (28 in production, M0.1's orphans) skip the Discord call and go straight to the soft-delete. `OrmAdRepository.delete()` now sets `status='deleted'`/`deleted_at` (cross-cutting rule 2) instead of `prisma.ad.delete()`; `get()` and `findByUserId()` were updated to exclude soft-deleted rows so `/marketplace list` and double-delete behave the same as they did under hard delete. PR [#35](https://github.com/GameOnPortugal/monorepo/pull/35) open on branch `feat/m5-ad-routing` (2026-08-20) — mark done once merged. | [#21](../known-issues.md), [G2.2](../discord-bot-feature-gap.md), [01 T3](01-marketplace-overhaul.md) |
| **M5.3** | **Schema migration**: `status`, `price_cents`, `images`, `bumped_at`, `expires_at`, `sold_at`, `deleted_at`, plus indexes. Backfill `status='active'`, normalise `adType` (`'sale'` → `'sell'`), parse `price_cents` where unambiguous. **Corrected history** (checked directly against production, 2026-08-20 — the wording above and in docs/known-issues.md #22 undersold this): `sell` (35 rows) is what the **old** bot wrote, Nov 2024 – Apr 2025. `sale` (28 rows) is what the **current, rewritten** bot has written for every ad since the April 2025 rewrite — `adType='sale' AND message_id IS NULL` is the exact same 28-row set as the orphaned-`message_id` bug (#0/#1); they are one population, not two. So this was never a one-time historical cleanup: the live write path (`SellSubcommand` → `CreateAd`) was still emitting `'sale'` on every new ad. Migration alone would not have fixed it — the drift would have reappeared on the next `/marketplace sell`. Fixed by normalising in `Domain/Marketplace/Ad.ts` (the one place every `Ad` is constructed) rather than editing `SellSubcommand.ts`, which is owned by a parallel PR (`Infrastructure/Bot/**`). PR [#29](https://github.com/GameOnPortugal/monorepo/pull/29) open on branch `feat/m5-ad-schema` (2026-08-20) — mark done once merged. | [#22](../known-issues.md), [01 T4](01-marketplace-overhaul.md) |
| **M5.4** | **pt-PT copy pass** across every marketplace string, plus `setDescriptionLocalizations`. | [#24](../known-issues.md), [G7.11](../discord-bot-feature-gap.md), [01 T5](01-marketplace-overhaul.md) |
| **M5.5** | **Listing embed + buttons** — `💬 Contactar` / `✅ Marcar vendido` / `🔄 Renovar`, colour-coded by type, ad ID in the footer so a row can be recovered from the message alone. | [01 T6](01-marketplace-overhaul.md) |
| **M5.6** | **`sold` / `bump` / `edit` subcommands.** Bump rate-limited to once per ad per 72h. | [01 T7](01-marketplace-overhaul.md) |
| **M5.7** | **`wanted` subcommand** — restores an old-bot feature; lives in `📖anuncios` alongside sales, distinguished by colour and title. | [G3](../discord-bot-feature-gap.md), [01 T8](01-marketplace-overhaul.md) |
| **M5.8** | **`list` improvements**: ephemeral, paginated, status-aware, working links. | [01 T9](01-marketplace-overhaul.md) |
| **M5.9** | **`search` subcommand** + `AdRepository.search()` — keyword / zone / type / condition / max price. The marketplace has no browse at all today. | [01 T10](01-marketplace-overhaul.md) |
| **M5.10** | **Limits + admin override**: max 10 active ads per user; `ManageMessages` holders bypass ownership on `delete`/`sold`. | [G2.3](../discord-bot-feature-gap.md), [01 T11](01-marketplace-overhaul.md) |
| **M5.11** | **Item images re-hosted to MinIO at upload**, never linked from Discord's CDN. | [01 decision 5](01-marketplace-overhaul.md) — needs M2.3. **M6.0's `MediaStorage` port and `SafeImageFetcher` guard are ready to use** — build on those rather than a new adapter. |

> **Settled, do not relitigate**: the create flow keeps slash-command *options*
> rather than a modal (modals cannot accept attachments or select menus, which
> would make images impossible); the 28 orphaned `message_id`s are **not**
> backfilled heuristically — they get marked expired on the first lifecycle run;
> historical free-text `state`/`zone` rows are **mapped at display time**, never
> rewritten.

---

## M6 — Jobs, lifecycle & media durability

**Goal**: scheduled work actually runs, the 624-screenshot gallery has live
images again, and ads have a real lifecycle instead of accumulating forever.

Full design in [`02-scheduler-and-lifecycle.md`](02-scheduler-and-lifecycle.md).

**Depends on**: M5.3 (status columns), M5.5 (buttons), M2.3 (MinIO).
**M2 should land before M6.3**, so recovered images are written into storage that
will still exist afterwards rather than to TedRelayer twice.

**Exit criteria**: a job runs on schedule and reports its outcome; ≥90% of the
624 screenshot rows resolve to a real message and a live image; the weekly winner
names a real winner; ads expire rather than pile up.

| ID | Item | Evidence | Notes |
| -- | ---- | -------- | ----- |
| **M6.0** | ✅ **DONE** — **`MediaStorage` port + `S3MediaStorage` adapter**, so images can actually be durably re-hosted. Domain port in `src/Domain/Media/` (put/exists/delete, key scheme `screenshots/<id>.<ext>` / `ads/<adId>/<n>.<ext>` — collision-free, stable, no user IDs), hand-rolled AWS SigV4 against MinIO (no `@aws-sdk/client-s3`, keeps the M3 audit gate flat), bound to `TYPES.MediaStorage` with an `InMemoryMediaStorage` fallback when `S3_*` is unset. Also ships `SafeImageFetcher` (host allowlist, size cap, streamed byte cap, timeout) for the ingest side. | Cross-cutting rule 3 | **M5.11, M6.2 and M6.3 all depend on this and are unblocked to use it.** This item builds the port only, not the jobs that consume it — M6.2's fix-at-source and M6.3's recovery job still need to be built against it. |
| **M6.1** | ✅ **DONE (2026-08-20)** — **In-process job runner** replacing the `scheduler/` container, keeping `bin/console.ts` as the manual entry point (`bun run:command jobs:run <name> [--dry-run] [--limit=N]`, or `jobs:run list`). `Job`/`JobResult`/`JobContext` in `src/Domain/Job/` (zero framework imports); `JobRunner` in `src/Infrastructure/Job/` computes cron schedules with `croner` (zero runtime deps, so it doesn't touch the `bun audit` gate) but owns its own tick loop rather than croner's built-in scheduler, so restart-safety and overlap protection are explicit and testable. **Restart safety**: a new `job_runs` table (migration `20260820091633_add_job_runs`) persists each job's `lastRunAt`; a tick compares the cron schedule's most recent fire time against that persisted value, so a redeploy mid-week can't double-run a job, and a missed slot (bot was down) is picked up on the next tick after boot — chosen over the plan's "accept at-most-once-per-process" fallback because the persistence cost was one small, independent table. **Overlap protection** is an in-memory `Set` populated synchronously before any `await`. **Graceful shutdown**: `JobRunner.stop()` stops scheduling and awaits in-flight work; wired into M4.4's `createShutdown` sequence in `src/index.ts` so scheduling stops and in-flight work drains **before** the gateway closes and Prisma disconnects — a second independent `process.on('SIGTERM')` would have raced `createShutdown`'s `process.exit()` and killed a draining job. Registered `week-screenshot-winner` (Sun 23:50) via a thin adapter (`WeekScreenshotWinnerJob`) that calls the existing command unmodified — M6.4 owns its behaviour. | [#3](../known-issues.md), [02 T1](02-scheduler-and-lifecycle.md) | The Chadburn + supervisord + `update_container.py` indirection existed **only** to cope with CapRover's generated container names, which docker-compose does not have. It also mounts `/var/run/docker.sock` — root-equivalent host access, for a cron job, on a box also running Plex and Frigate. |
| **M6.2** | **Fix screenshot capture at source**: store the **posted message's** ID (not `interaction.id`) and re-host the image at submit time. | [#18](../known-issues.md), [#19](../known-issues.md), [02 T2](02-scheduler-and-lifecycle.md) | Verified: stored `1511065198885212340` does not resolve; the real message is `1511065203364860014`. Same root cause as M0.1. **M6.0's `MediaStorage`/`SafeImageFetcher` are ready to use** — do not build another storage adapter. |
| **M6.3** | **`screenshots:relink`** recovery job — page back through `🖼screenshots`, match the `ID: #<uuid>` in each message **deterministically**, repair `message_id`, re-host the freshly-signed attachment. | [02 T3](02-scheduler-and-lifecycle.md) | Idempotent, rate-limit-aware, honest reporting of unmatched rows and unmatched messages. **M6.0's `MediaStorage.exists()` is what makes re-running this safe** — check before you re-upload. |
| **M6.4** | ✅ **DONE (2026-08-20)** — **Hardened `screenshots:winner`** (still unscheduled until M6.1 lands): `findByWeek` *was* using dayjs's locale-default Sunday→Saturday window, not the old bot's Monday→Sunday — fixed and pinned with a boundary test in `Domain/Screenshot/ScreenshotWeekWindow.ts` (explicit Europe/Lisbon assumption, documented in-code). Ties now resolve deterministically to the earliest submission (first to post wins), stable across runs. A screenshot whose message has vanished is skipped and counted, not logged as an error. The old bot's `Concurso DD/MM ABERTO` opening banner is restored (plain text, no image asset ever existed to port). The announcement and banner are now pt-PT. `!give-xp <@user> 1000` is **removed** — confirmed decision, not revisited without someone confirming the receiving bot is still in the guild. `week-screenshot-winner` now supports `--dry-run`, which reports to a new `CommunityChannels.ADMIN` channel instead of posting publicly (ID unverified — set `DISCORD_CHANNEL_ADMIN` before the first supervised run); `bin/console.ts` itself was not touched. | [#3](../known-issues.md), [G7](../discord-bot-feature-gap.md), [02 T4](02-scheduler-and-lifecycle.md) | `screenshots:winner` still finds nothing useful in production until M6.3 (`message_id` repair) lands — this item only hardens what happens once it does. |
| **M6.5** | **`ads:lifecycle`** — 14 days idle → prompt → 72h → **expire, never delete**. Buttons instead of DM reactions; one DM listing all of a user's expiring ads; renewal bumps **the same row** with a new `message_id`. | [G5](../discord-bot-feature-gap.md), [02 T5](02-scheduler-and-lifecycle.md) | The old bot's version deleted the row on silence *and* on a closed DM. Keep its shape, drop the data loss. |
| **M6.6** | **`ads:reconcile`** — walk active ads, mark rows whose message has vanished. Catches moderator deletions and M0.1's orphan case. | [02 T6](02-scheduler-and-lifecycle.md) | |
| **M6.7** | ✅ **DONE (2026-08-19)** — **Retired `scheduler/` directory**, removed references from `AGENT.md`, `.github/labeler.yml`, `docs/operations.md` and others; noted weekly job now has no trigger until M6.1 ships. Archive the separate `GameOnPortugal/scheduler` repo and delete the Docker Hub image — out of scope, needs Luis. | [02 T7](02-scheduler-and-lifecycle.md), revival plan item 26 | |
| **M6.8** | ✅ **DONE (2026-08-20)**, landed with M6.1 in the same PR — **Job observability**: `DiscordJobReporter` posts a per-run summary through the existing `GuildClient` port to a new `CommunityChannels.ADMIN` channel (`DISCORD_CHANNEL_ADMIN`, unset by default — no verified admin channel exists for this guild, so it logs but doesn't post until configured, rather than guessing a channel). Noise policy: **loud on failure** (the run threw, or the job reported `failed > 0`) — always posts; **quiet on success** — only posts when `changed > 0`; **silent** for a no-op run or a dry run, since a summary for a job that did nothing is exactly the noise that gets a channel muted. A reporter failure is caught in two places (inside `DiscordJobReporter.report` around the `sendMessage` call, and again in `JobRunner.execute`) so it can never fail the job it's reporting on. | [02 T8](02-scheduler-and-lifecycle.md) | |

> Every job gets: structured start/finish logs with counts, a `--dry-run` flag,
> and a bounded work limit per run. And after deploying, **verify inside the
> container** — trusting the repo about what is deployed is exactly how this went
> unnoticed for sixteen months.

---

## M7 — Trophies — make the leaderboard true again

**Goal**: `/trophy rank` reflects trophies people actually earned this month.

This is the **highest-value gap in the port**, because the feature *appears* to
work: 118 profiles and 4,971 trophies are presented as a live leaderboard that has
not moved since **2024-12-02**. The read side was ported; the entire
data-producing side was not.

**Depends on**: M0.8 (ranking correctness) and M3.3 (whatever HTTP client wins).
Otherwise parallel with M5/M6.

**Exit criteria**: the sync job creates new trophy rows on a schedule, the
"data frozen" caveat can be deleted from the portal and the bot, and moderation
flags are written as well as read.

| ID | Item | Evidence |
| -- | ---- | -------- |
| **M7.1** | **Port the PSNProfiles crawler** behind a `TrophySource` domain port — platinum rarity + completion date (incl. the blank-first-row workaround and "not earned yet" detection), profile world/country rank, paginated platinum lists. Respect robots and rate limits; cache; back off. | [#10](../known-issues.md), [G11 / §4.1](../discord-bot-feature-gap.md) |
| **M7.2** | **Port the points engine** — the rarity→TP ladder (>30.01% = 50 TP … ≤0.6% = 2000 TP) and `TrophyAlreadyClaimedException` (one claim per profile+URL). | [§4.2](../discord-bot-feature-gap.md) |
| **M7.3** | **`trophies:sync` job** with catch-up mode (stop early at the first already-claimed trophy, unless `--all --profile=X`) and the auto-moderation flags: no rank → `isBanned` + `isExcluded`; Discord error 10007 → `hasLeft` + `isExcluded`. | [§4.3](../discord-bot-feature-gap.md) |
| **M7.4** | **`/trophy check` shows live world/national rank again**, and the specific message when a profile is banned or has left. | [§4.5](../discord-bot-feature-gap.md) |
| **M7.5** | **`/trophy create` accepts both URL shapes** — bare profile and the 6-segment trophy URL. | [§4.6](../discord-bot-feature-gap.md) |
| **M7.6** | **Rank presentation parity** — the guild's custom plat/gold/silver/bronze emojis for positions 1/2/3/rest, and pagination buttons instead of a `limit` option capped at 10. | [§4.7](../discord-bot-feature-gap.md), C4 |
| **M7.7** | **`fix-old-trophies` backfill** as a console command, for rows with a null `completionDate`. | [§4.4](../discord-bot-feature-gap.md) |
| **M7.8** | **Trophy announcements through the bot, not a webhook.** Post "Parabéns \<@user\>! Acabaste de receber N TP…" via `GuildClient` to a channel from the M1.7 config; delete `TROPHY_WEBHOOK`. **Decided** — see [Decisions taken](#decisions-taken). | [§7.7](../discord-bot-feature-gap.md), [#8](../known-issues.md) |

---

## M8 — Community portal

**Goal**: a public site that promotes the community and shows what it produces,
plus an admin portal so moderation stops meaning SSH and SQL.

Full design, brand direction, page list and task table in
[`03-portal.md`](03-portal.md). Phase A can start in parallel with M5–M7; the
Screenshots page (M8.8) is hard-blocked on M6.3.

**Depends on**: M2 (hosting, MinIO), M6.3 (live images).

**Exit criteria**: `game-on-portugal.pt` serves the portal; an admin can moderate
ads, screenshots and jobs from a browser; a shared link previews with the brand.

| ID | Item |
| -- | ---- |
| **M8.1** | Vendor the brand — guild icon + banner into the repo, trace an SVG, define design tokens. **There is no logo file in this repo today**; `webpage/assets/img/logo.png` is referenced by `index.html` and does not exist. |
| **M8.2** | Add `portal-api` / `portal-web` to release-please config **and** manifest, and uncomment their services in `infrastructure/game-on-portugal.yaml` — in the same PR that creates the directories (release-please errors on a package path that does not exist). |
| **M8.3** | Scaffold `portal/api` (Bun + Hono) with read-only endpoints. **The bot owns the schema**; the portal reads it and never runs migrations. |
| **M8.4** | **Shared normalisation module** — 21 platform strings → 4 platforms + Other; legacy Portuguese conditions → the enum; zone → district; `price_cents`. Used by **both** bot and portal so a listing renders identically in Discord and on the web. Map at display time; never rewrite history. |
| **M8.5** | Scaffold `portal/web` (Vite + React + Tailwind), mobile-first at 375 px. |
| **M8.6** | Home page — hero, live stats, latest screenshots, newest listings, Discord CTA. |
| **M8.7** | Marketplace pages — grid, filters, detail. |
| **M8.8** | Screenshots gallery + Hall of Fame. **Blocked on M6.3.** Thumbnails at ingest — a phone must not download a 4 MB PNG per grid tile. |
| **M8.9** | Trophies leaderboard, with an honest "data frozen" notice until M7 lands. |
| **M8.10** | Discord OAuth + admin shell, gated on guild membership **and `ManageMessages`** — the same definition of "admin" the bot uses. |
| **M8.11** | Admin CRUD + audit log. |
| **M8.12** | Admin jobs page, wired to M6.1's runner. |
| **M8.13** | SEO, OG cards, sitemap. |
| **M8.14** | Deploy + CI, documented in `operations.md`. |
| **M8.15** | **Plan 04 phase 4** — point the `game-on-portugal.pt` apex and `www` at HTZ1 (and **refresh the OVH zone**, which applies the zone, not the record), add the apex Caddy block, archive `GameOnPortugal/gameonportugal.github.io`, and delete this repo's orphaned `webpage/`. Resolves [#9](../known-issues.md). |

> **Settled**: dark-first (the brand is black); the four brand face-button colours
> are the four platform colours, assigned once and never varied; pt-PT only for
> v1, structured for i18n; v1 **includes** the admin portal; display names only,
> never user IDs, with an opt-out from day one.

---

## M9 — Close the feature gap, retire the dead weight

**Goal**: everything in `old-discord-bot/` is either ported or explicitly
dropped, so the directory can be deleted and the feature-gap document closed.

**This milestone shrank by roughly two thirds on 2026-08-19.** LFG (M9.3) and
stock alerting (M9.4) are dropped outright, `commandchannellink` (M9.2) with
them, and channel moderation (M9.1) is reimplemented on Discord AutoMod instead
of ported. See [Decisions taken](#decisions-taken) for the reasoning behind each.
What remains is deletion work plus the privacy flag.

**Depends on**: M1.10 (permissions) and M4 throughout.

| ID | Item | Evidence | Notes |
| -- | ---- | -------- | ----- |
| **M9.1** | **Channel rules — reimplemented as Discord AutoMod, not a message pipeline.** Define the guild's AutoMod rules (keyword/regex blocking) as checked-in JSON applied through `@discordjs/rest`, and express "commands only" channels as channel *permissions* (deny `SendMessages`, allow `UseApplicationCommands`) rather than deleting messages after the fact. | [G16 / §6.1](../discord-bot-feature-gap.md) | **Redesigned — see decision 4.** The straight port needed the `MessageContent` privileged intent and a message-event pipeline the rewrite does not have, and it contradicted M4.6's minimal-intents position. AutoMod does the same job server-side, with no intent, no gateway traffic, no bot latency, and it keeps enforcing while the bot is down. The `specialchannels` table was **empty** — dropped along with the M9.2/M9.3/M9.4 models in migration `20260820102655_drop_dead_models` (M9.6's schema half, 2026-08-20). |
| **M9.2** | ✅ ~~`commandchannellink`~~ — **dropped.** Delete the `CommandChannelLink` model and its table. | [G17 / §6.2](../discord-bot-feature-gap.md) | **Done.** `CommandChannelLink` (table `commandchannellinks`) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`. No code referenced it. |
| **M9.3** | ✅ ~~**LFG**~~ — **dropped, will not be ported.** Delete the four LFG models (`LfgProfile`, `LfgGame`, `LfgEvent`, `LfgParticipation`) and their tables. | [G13, G14 / §5](../discord-bot-feature-gap.md) | **Done.** `LFGProfile`/`LFGGame`/`LFGEvent`/`LFGParticipation` (tables `lfgprofile`/`lfggames`/`lfgevents`/`lfgparticipations`) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`, along with their foreign keys. **Decided by Luis, 2026-08-19 and reaffirmed 2026-08-20: he is not interested in moving LFG** — see [Standing instructions](#standing-instructions-from-luis), where it is restated as closed to discussion. This closes the single largest item in the plan (~40% of the old bot's surface) and removes the one work item that needed its own spec document. All four tables were confirmed **empty** in production on 2026-08-20 before the drop, so there was no data to preserve and no migration risk. |
| **M9.4** | ✅ ~~**Stock alerts + Telegram bridge**~~ — **dropped.** Delete the `StockUrls` model and its table, and the `TELEGRAM_ACCESS_TOKEN` env var. | [G15 / §7.5](../discord-bot-feature-gap.md) | **Done.** `StockUrls` (table `stockurls`) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`. `TELEGRAM_ACCESS_TOKEN` was already absent from `.env.example` and the compose files (cleared by an earlier M9.5/M1.6 pass) — verified, nothing left to remove. `stockurls` held **0 rows** in production — the feature had not been used once since the rewrite went live in April 2025. The legacy implementation also lost every pending alert on restart (bare `setTimeout`), so a port would have been a rewrite, not a port. |
| **M9.5** | **Loki, not Sentry.** Delete `SENTRY_DSN`, `REDIS_DSN`, `TROPHY_WEBHOOK` and `TELEGRAM_ACCESS_TOKEN` from `.env.example` and the compose files. | [G22 / §7.6](../discord-bot-feature-gap.md), [#8](../known-issues.md) | **Decided.** Loki is already half-wired and there is an existing Grafana Cloud stack to ship to; Sentry would be a second vendor for the same signal. Do **not** enable `LOKI_HOST` until M0.7 lands — the entrypoint prints the database password on the first line, and enabling Loki first ships it to Grafana Cloud. Fix the `job: 'tedcrypto-campaign'` label bug in M3.5. `.env.example`/compose already clean as of the M9.2/M9.3/M9.4 PR — verified 2026-08-20, no dead vars left. |
| **M9.6** | **Retire `old-discord-bot/`** — move to `reference/` once M7 has taken what it needs from the scraper, then delete. Drop the seven now-dead Prisma models in one migration (4 LFG + `StockUrls` + `CommandChannelLink` + `SpecialChannel`). | revival plan item 25 | **Schema half done, 2026-08-20**: all seven models (the table above undercounted — it's 4 LFG + `StockUrls` + `CommandChannelLink` + `SpecialChannel`, not six) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`, guarded by a pre-drop row-count check that aborts the migration loudly (rather than a silent `DROP TABLE IF EXISTS`) if any of the seven tables is unexpectedly non-empty when it runs. `SpecialChannel`/`specialchannels` (M9.1's leftover, empty per that item's note) went in the same migration since it's another empty dead table with no reason to wait. **Remaining**: the `old-discord-bot/` directory itself is untouched — **M7.1 and M7.2 (the PSNProfiles scraper and points ladder) landed today** (`#24`, `TrophySource`/`PsnProfilesTrophySource` in `discord-bot/src`), which was the last blocker on "has M7 taken what it needs from the scraper" — but confirming the port took *everything* worth keeping (not just the two headline pieces) is a separate judgement call for whoever picks up the directory removal, not assumed here. |
| **M9.7** | **Privacy**: a single `public_opt_out` flag honoured by **both** the bot and the portal, a short privacy page, and a deletion request path that removes portal content too. | [03 decision 5](03-portal.md) | The community is EU-based. Cheap now, expensive to retrofit — do it with M8.7, not after. |

---

## Cross-cutting rules

These are not milestones. They are constraints on every PR in every milestone.

1. **pt-PT for all user-facing copy.** Command and subcommand *names* stay
   English — they are already registered with Discord and English verbs are the
   platform convention — but everything a member **reads** is Portuguese. The
   rewrite's English is a regression, not a decision anyone made.
2. **Soft-delete, never hard-delete.** The old bot destroyed rows on expiry,
   which is why nothing can be reconstructed.
3. **Never store a Discord CDN URL as the durable copy of an image.** They are
   signed and expire within 24 hours. This is the sole cause of the empty
   gallery.
4. **Store the ID of the message you actually posted** — not `interaction.id`,
   not a placeholder to be filled in later. Both live data-corruption bugs are
   this one mistake.
5. **Schema changes need a migration**, because `prisma migrate deploy` runs in
   the container entrypoint and a failing migration is a failed **boot**, not a
   failed CI job.
6. **Nothing is reachable until it is bound** in
   `Infrastructure/DependencyInjection/inversify.config.ts`. A handler, a
   subcommand or a repository that is not bound there simply does not exist.
7. **Conventional Commit PR titles with a scope.** PRs are squash-merged and the
   title becomes the commit release-please reads. `chore:` cuts no release — the
   repo's 30-commit `chore:` streak is precisely why nothing has ever shipped.
8. **Verify in production, not in the repo.** The scheduler ran zero jobs for
   sixteen months while the repo said otherwise.
9. **Evaluate before you implement, and write the decision down.** Every feature
   item is an outcome, not a spec — see
   [Standing instructions from Luis](#standing-instructions-from-luis). Check
   what is in the tree today, prefer the better modern approach where there is
   one, and record what you chose. The one item with no latitude is **LFG: it
   is not being ported.**

---

## Progress ledger

Update this table as items land. `—` = not started.

| Milestone | Items | Done | Status |
| --------- | ----- | ---- | ------ |
| M0 Stop the bleeding | 9 | 9 | **complete** — #11 #12 #13 #14 #15. All five live defects verified fixed *in production*, not just in CI |
| M1 Restore the signal | 10 | 7 | #9 #12 #18 #21. Remaining: M1.2 (a dedicated harness — tests exist but grew ad hoc), M1.3 (env validation at boot), M1.4 (loud registration failure), M1.10 (permission model) |
| M2 Infrastructure cutover | 6 | 5 | **cut over 2026-08-19** — production is HTZ1, Portainer stack 46. M2.5 (decommission TedRelayer) due 2026-09-02 |
| M3 Dependencies & container | 8 | 7 | #11 #20. `bun audit` **26 advisories → 0** and the gate is blocking again. Remaining: **M3.6 Prisma 6→7**, deliberately left alone as its own PR |
| M4 Discord API modernisation | 10 | 0 | — (M3.2 cleared the deprecations that were blocking it) |
| M5 Marketplace overhaul | 11 | 0 | M0.1 already did plan 01's task 1 |
| M6 Jobs, lifecycle & media | 9 | 4 | M6.7 (#19) `scheduler/` deleted; M6.0 (#30) `MediaStorage` port + S3/MinIO adapter; M6.1 + M6.8 the in-process runner, scheduling `week-screenshot-winner` and reporting per-run to an (optional) admin channel. **M6.2/M6.3/M6.5/M6.6 can now register real jobs against a working runner, and re-host through a working storage port** |
| M7 Trophies | 8 | 0 | M0.8 fixed the read side; the data-producing side is untouched |
| M8 Community portal | 15 | 0 | — |
| M9 Feature gap & dead weight | 7 | 3 | M9.2/M9.3/M9.4 **done** — seven dead models dropped in migration `20260820102655_drop_dead_models`; M9.1 redesigned onto AutoMod; M9.6 schema half done, directory removal still open |
| **Total** | **92** | **41** | |

### What landed on 2026-08-19/20

Eighteen PRs, `v1.0.0` and `v1.1.0` — the repo's first releases ever, after a
30-commit `chore:` streak that cut none.

**The three live production failures are fixed and verified against production:**

- `/marketplace sell` had failed **28 times out of 28** since 2025-05-11 — a 100%
  failure rate, not the 28-of-33 this document previously claimed. `CreateAdHandler`
  returns `void`, so `const ad = await handle(command)` was `undefined` and `ad.id`
  threw *after* the reply had already been posted; the catch block then replied a
  second time and buried the real error under `InteractionAlreadyReplied`.
- `/trophy rank` returned an arbitrary ten profiles sorted among themselves. Of the
  ten it displayed, **one** belonged in the real top ten; the true #1 (58,050 points
  across 193 trophies) did not appear at all. Verified fixed by running the deployed
  query against the production database.
- The scheduler ran zero jobs — and was **doubly** dead: every job commented out,
  *and* pointing at `node scripts/…` commands from the old bot that do not exist in
  the rewrite. Deleted (M6.7).

**Found while working, not in any plan when the session started:**

- **The nightly backup had been silently failing for seven weeks.** The dump
  succeeded every night; the SMB *upload* failed because `DB_DUMP_TARGET` addressed
  the NAS over the internet by DDNS name. Nobody had ever checked the destination —
  "the container is Up" is not evidence a backup works.
- **The trophy count is 4,971, not 4,477.** The figure everywhere in these docs came
  from `information_schema.table_rows`, an InnoDB *estimate*.
- **CI depended on a hang.** Bounding the entrypoint's DB wait (M0.7) revealed that
  `docker-compose.ci.yml` never passed `DATABASE_URL` to the container: Bun
  auto-loads `.env` for the *app*, but `entrypoint.sh` is `/bin/sh` and never saw it.
  The readiness loop had been spinning forever and CI relied on that to stay alive.
- **TLS certificate validation was disabled on a live path** (`rejectUnauthorized:
  false` *and* `checkServerIdentity: () => undefined`). Recorded as finding **A9**.
  A grep for `rejectUnauthorized` under-reports it — the insecure client is reached
  through `RetryAxiosHttpClient`, which configures no agent of its own.
- **The secret scan judged every PR by every branch**, so one branch's false positive
  reddened every other open PR (#21).
- **Three ads were created in DMs**, confirming the `guildId === null` case is real
  and not hypothetical: of 70 ads, 62 are in `📖anuncios`, 5 in `💬chat`, 3 in a DM.

**Still needs Luis** (neither can be done non-interactively): minting
`RELEASE_PLEASE_TOKEN`, and copying the credentials from the operator's
`~/gop-backups/2026-08-19/` into 1Password — **the bot token still has no durable
copy anywhere**.

Already closed before this plan was written: [#1](../known-issues.md) (schema
drift), [#4](../known-issues.md) (6 type errors), and the repo side of
[#2](../known-issues.md) and [#6](../known-issues.md) (CI/CD rewritten,
release-please reconfigured).

---

## Decisions taken

The four questions this plan could not answer on its own were settled on
**2026-08-19**. They are recorded here rather than in a side document because
each one deletes work from the milestones above.

**1. LFG is not coming back.** Luis: *not interested in moving LFG.* This was the
largest single item in the plan and the only one that needed its own spec before
any code could be written. The four tables are empty, so there is nothing to
preserve; the models get dropped with M9.6. Worth telling the community
explicitly, because the old rankings are gone and will not be reconstructed.

**2. Stock alerting is dropped.** Not a judgement call in the end — `stockurls`
holds **0 rows**, so the feature has been dead for the entire life of the
rewrite. Dropping it also removes the last reason to keep a Telegram dependency
in the bot.

**3. Loki, not Sentry.** One log pipeline, one vendor, and Loki is the one
already half-wired. `SENTRY_DSN` leaves with `REDIS_DSN`, `TROPHY_WEBHOOK` and
`TELEGRAM_ACCESS_TOKEN`.

**4. Channel moderation is reimplemented, not ported.** The old bot read every
message through a `regex` / `only_commands` validator backed by the
`specialchannels` table. Reproducing that means the `MessageContent` privileged
intent, a gateway message pipeline the rewrite does not have, and per-message bot
latency — to do something **Discord now does natively**. AutoMod rules cover the
regex case server-side, and a channel permission overwrite (deny `SendMessages`,
allow `UseApplicationCommands`) covers "commands only" with no code at all. Both
keep working when the bot is down, which the old validator did not. The rule
definitions still belong in the repo so the configuration is reviewable.

**5. Screenshots are kept indefinitely.** 624 images at a few MB each is single-
digit gigabytes against 394 GB free on HTZ1; a retention policy would cost more
in argument than in disk. No expiry for v1. What *does* matter is generating a
thumbnail at ingest (M8.8) so a phone does not download a 4 MB PNG per grid
tile. Revisit only if the bucket passes 50 GB.

### Two smaller calls made in passing

**M7.8 — the trophy webhook is not reinstated.** Trophy announcements should go
through the bot's own `GuildClient` to a channel named in the M1.7 config, not
through a `TROPHY_WEBHOOK` URL. Same message, one fewer secret, one fewer thing
that breaks silently when someone regenerates the webhook, and the announcement
gets the bot's identity and embed styling for free.

**`RELEASE_PLEASE_TOKEN` is still unset.** `release-please.yml` falls back to
`GITHUB_TOKEN`, which works — it cut the 1.0.0 release PR — but PRs opened with
that token do not trigger downstream workflows, so the release PR itself gets no
CI run. Minting a fine-grained PAT needs a browser; it is left for Luis.

## Traceability

Every finding in the evidence documents maps to exactly one work item. If you
find something here without a source, or a source without an item, that is a bug
in this document.

### `known-issues.md` → work items

| Issue | Item | Issue | Item |
| ----- | ---- | ----- | ---- |
| #0 sell fails 100% | M0.1 | #13 deprecated APIs | M3.2, M3.6, M3.7 |
| #1 schema drift | ✅ fixed · gated by M1.5 | #14 no discord.js tests | M0.9, M1.2 |
| #2 CI deploys nowhere | repo side ✅ · M2.2, M2.4 | #15 silent registration failures | M1.4 |
| #3 scheduler never ran | M6.1, M6.4 | #16 hardcoded IDs | M1.7 |
| #4 six type errors | ✅ fixed | #17 dead ends | ✅ fixed · M1.8 |
| #5 nothing gates quality | M1.1 (lint) · rest ✅ | #18 wrong screenshot message ID | M6.2, M6.3 |
| #6 no release ever cut | repo side ✅ · M2.2 | #19 all image URLs dead | M6.2, M6.3, M5.11 |
| #7 stale dependencies | M3.1–M3.6 | #20 ads posted anywhere | M5.1 |
| #8 wrong `.env.example` | M1.6, M9.5 | #21 delete leaves the message | M5.2 |
| #9 orphaned `webpage/` | M8.15 | #22 `adType` drift | M5.3 |
| #10 trophies frozen | M7.1–M7.3 | #23 free-text columns | M5.3, M8.4 |
| #11 password in logs | M0.7 | #24 Portuguese dropped | M5.4, cross-cutting rule 1 |
| #12 unbounded DB wait | M0.7 | | |

### `05-bot-audit-and-hardening.md` → work items

| Finding | Item | Finding | Item |
| ------- | ---- | ------- | ---- |
| A1 mention injection | **M0.2** | B1 rankings wrong | **M0.8** |
| A2 no authorisation | M1.10, M4.3 | B2 ephemeral dropped | M0.3 |
| A3 error leakage | M0.5 | B3 double-reply | M0.4 |
| A4 unbounded download | M4.9 | B4 missing `@injectable()` | M0.6 |
| A5 second gateway client | M4.5 | B5 empty multiInject | ✅ verified safe |
| A6 empty-token fallback | M1.3 | B6 embed limits | M4.10 |
| A7 no supply-chain gate | M1.9 | B7 duplicate write on sell | M0.1 |
| A8 container runs as root | M3.8 | B8 image URLs rot | M6.2 |
| C1 no `deferReply` | M4.2 | B9 unchecked rank indexing | M0.8, M7.6 |
| C2 deprecated options | M3.2 | B10 `ads[position]` undefined | ✅ fixed |
| C3 global-only registration | M4.3, M1.4 | E0 dependency currency | M3.1–M3.6 |
| C4 no components | M4.7, M4.8, M5.5, M7.6 | E no healthcheck | M3.8 |
| C5 missing registration metadata | M4.3, M5.4 | E `entrypoint.sh` password | M0.7 |
| C6 no lifecycle handlers | M4.4 | D (capability gaps) | M7, M9 |
| C7 untyped interactions | M4.1 | | |

### `06-discord-api-modernisation.md` → work items

P1 → M0.3 · P2/P3 → M3.2 · P4 → M0.4 · P5 → M4.1 · §2 lifecycle → M4.2 ·
§3a Components V2 → M5.5 (spike first, embeds are the fallback) · §3b buttons →
M5.5, M6.5, M7.6 · §3c modals → M5.6 · §3d autocomplete → M4.8 ·
§3e context menus → **deferred**, revisit after M4.7 · §4 registration → M4.3 ·
§5 client config → M0.2, M4.6 · §6 rate limits → M4.6, M6.3 ·
§7 localisation → M5.4 · §8 attachment expiry → M6.2 · §9 discord.js v15 →
covered incidentally by M0.3/M0.4/M3.2, not a milestone.

### `07-dependency-upgrades.md` → work items

D1 `reflect-metadata` · D2 `dotenv` · D3 `@types/bun` · D4 `typescript` peer ·
D5 Bun drift → all **M3.1**. Step 2 gates → M1.9 + M1 generally · step 3
discord.js → M3.2 · step 4 axios → M3.3 · step 5 batch → M3.4 · step 6
winston-loki → M3.5 · step 7 Prisma → M3.6 · standing policy → M1.9.
The machine-configuration note is **out of repo scope** and tracked separately.

### `discord-bot-feature-gap.md` → work items

| Row | Item | Row | Item |
| --- | ---- | --- | ---- |
| G1 ping | ✅ | G14 LFG points cron | M9.3 — **dropped** |
| G2 sell | M0.1, M5.1–M5.5 | G15 stock alerts | M9.4 — **dropped** |
| G3 wanted ads | M5.7 | G16 channel restrictions | M9.1 — **AutoMod** |
| G4 list / delete | M5.2, M5.8, M5.10 | G17 command→channel link | M9.2 — **dropped** |
| G5 has-been-sold cron | M6.5 | G18 command prefix | ✅ obsolete by design |
| G6 screenshot CRUD | M6.2 | G19 permission checks | M1.10 |
| G7 weekly winner | M6.4 | G20 DM wizards | superseded — preview/confirm lands with M5.6 |
| G8 link PSN profile | M7.5 | G21 message chunking | M4.10 |
| G9 check profile | M7.4 | G22 Sentry | M9.5 |
| G10 ranks | M0.8, M7.6 | G23 Telegram bridge | M9.4 — **dropped** |
| G11 PSN crawler | **M7.1** | G24 trophy webhook | M7.8 — **dropped for a channel post** |
| G12 fix-old-trophies | M7.7 | G25 Redis / Keyv | ✅ dropped — M1.6 removes the container |
| G13 LFG subsystem | M9.3 — **dropped** | | |
