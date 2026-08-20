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
bot  marketplace  screenshots  trophies  media  scheduler  plans
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
| **M1.2** | ✅ **DONE (2026-08-20, #27)** — **Discord-layer test harness** — a fake interaction object and a suite covering every subcommand path. | [#14](../known-issues.md), [01 T12](01-marketplace-overhaul.md) | No mocking library needed and none should be added. Both merged bugfix PRs (#1, #2) and all three live bugs are in this layer. |
| **M1.3** | ✅ **DONE (2026-08-20, #28)** — **Env validation at boot** (zod or typebox). Exit non-zero on a missing required var; delete the three `?? ''` token fallbacks. | A6 | Today an unset `DISCORD_TOKEN` silently binds `InMemoryClient` and you get a bot that does nothing. |
| **M1.4** | ✅ **DONE (2026-08-20, #28)** — **`registerSlashCommands` fails loudly** — through the injected `Logger`, not `console.error`, and fatally rather than starting with a stale command set. | [#15](../known-issues.md), C3 | |
| **M1.5** | **Schema-drift gate**: `prisma migrate diff --exit-code` in CI, and switch test setup from `db push` to `migrate deploy` so tests take production's path. | [#1](../known-issues.md), revival plan item 17 | The drift itself is fixed; this stops it recurring. |
| **M1.6** | **Fix `.env.example`** and regenerate the production compose file from it — dropping the Redis container and the four env vars nothing reads. | [#8](../known-issues.md) | It advertises `REDIS_DSN` / `SENTRY_DSN` / `TROPHY_WEBHOOK` / `TELEGRAM_ACCESS_TOKEN` (all unused), omits `LOKI_HOST` / `LOKI_AUTH` (both used), and gives `DATABASE_URL` a host matching no service. `Makefile` does `include .env`, so it is the first thing a contributor copies. |
| **M1.7** | **Externalise the hardcoded Discord IDs** to config. Add `MARKETPLACE` (`📖anuncios`), and the four LFG channels while you are in there. | [#16](../known-issues.md), [G5.5](../discord-bot-feature-gap.md) | Only `SCREENSHOTS` is mapped today; any channel change means a code change, image rebuild and redeploy. **The trophy emoji IDs are verified correct — do not "fix" them.** |
| **M1.8** | ✅ **Clear the dead ends**: `test:local` → a file that does not exist; Makefile `create-user` / `console-command` / `db-seed` targets invoking `ts-node` (not a dependency) or a seed script that is not configured; `discord-bot/README.md` is unedited `bun init` boilerplate; decide the fate of the bound-but-uncalled `RetryAxiosHttpClient`. | [#17](../known-issues.md) | **Done.** `test:local` and `db-seed` removed (no `.env.local` / no seed script ever existed); `create-user` removed (no such console command is registered); `console-command` repaired to call the real `bun run:command` entry point instead of the nonexistent `ts-node`; README rewritten; `RetryAxiosHttpClient` kept, with a comment pointing at M7.1. Also fixed in the same PR: `AxiosHttpClient` was disabling TLS certificate validation on a live path (`TYPES.HttpClient` → `RetryAxiosHttpClient` → `AxiosHttpClient`, used by `CreateScreenshotHandler`'s attachment download since April 2025) — new finding A9 in [05](05-bot-audit-and-hardening.md), cross-referenced with M4.9. |
| **M1.9** | **Supply-chain gates**: `bun audit` failing on high/critical, plus Renovate or Dependabot **grouped** (weekly patches in one PR, majors separate, `discord.js` in its own group). | A7, [07 step 2](07-dependency-upgrades.md) | Without this, M3 becomes a one-off project that has to be repeated in 2027. |
| **M1.10** | ✅ **DONE (2026-08-20)** — **Permission model.** A `ManageMessages`-based admin check plus guild-only contexts. | A2, [G19/§7.3](../discord-bot-feature-gap.md), [01 decision 4](01-marketplace-overhaul.md) | Built `isGuildAdmin()` in `src/Domain/Bot/AdminCheck.ts` — keys off the `ManageMessages` **guild permission** (handles both a real `GuildMember.permissions` `PermissionsBitField` and the raw HTTP-interaction string bitfield shape), safe (returns `false`, never throws) when `guild`/`member` is null. All four top-level commands (`ping`, `screenshot`, `trophy`, `marketplace`) now call `.setContexts(InteractionContextType.Guild)` (same edit as M4.3, see there) — this is the fix for `ListAdsSubcommand` building `guildId === null` links in a DM. `isGuildAdmin()` is built and unit-tested but **not wired into any handler** — no command today actually needs admin-only behaviour; the check is available for **M5.10** (marketplace admin override), **M9.1** (AutoMod) and **M9.3**. `setDefaultMemberPermissions(null)` was set explicitly (not omitted) on all four commands to document "open to everyone" is intentional, not an oversight — see `AdminCheck.ts`'s doc comment for why that builder call is a **client-side UI hint only** and any real admin gate must call `isGuildAdmin()` server-side. Tests: `tests/Integration/Domain/Bot/AdminCheck.test.ts`. |

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
| **M4.1** | ✅ **DONE (2026-08-20, #27)** — **Type the interaction layer.** `SlashCommandContext.interaction` → `ChatInputCommandInteraction`; `builder()` → `SlashCommandBuilder`; introduce a discriminated `InteractionContext` covering chat-input / autocomplete / component / modal. | P5, C7 — `SlashCommandContext.ts:5` | **The enabler.** `interaction: any` is *why* M0.3, M0.4 and the `noUncheckedIndexedAccess` bugs got through review. Typing it converts a class of runtime bugs into compile errors — but only because M1 put `tsc --noEmit` in CI. |
| **M4.2** | ✅ **DONE (2026-08-20, #27)** — **`deferReply()` in every non-trivial handler**, then `editReply()`. | C1, [06 §2](06-discord-api-modernisation.md) | **There is not a single `deferReply()` in the codebase.** Worst offenders: `/screenshot create` downloads and MD5s an attachment inside the 3s window; `/trophy rank` loads up to 1000 profiles with all their trophies; `/marketplace delete` by position runs a query first. Deferring extends the window to 15 minutes. Note the ephemeral decision moves to `deferReply` and cannot be changed later. |
| **M4.3** | ✅ **DONE (2026-08-20)** — **Registration overhaul.** Guild-scoped dev path; skip the `PUT` when Discord already has the same command set registered; add `setDefaultMemberPermissions`, `setContexts([Guild])` and `setIntegrationTypes`. | C3, C5, [06 §4](06-discord-api-modernisation.md), A2 | Built with two deliberate deviations from the item's original wording. **(1)** The dev guild is **`DISCORD_DEV_GUILD_ID`** (new, optional, `Config/env.ts`), **not** `DISCORD_GUILD_ID` as this row originally said — `DISCORD_GUILD_ID` (`DiscordChannels.ts`) had since become "the production guild" with its own verified default, so reusing it here would risk registering guild-scoped commands into production, silently shadowing the global ones. Unset (the default) means global registration, same as production; `resolveCommandRegistrationTarget()` in `src/Domain/Bot/CommandRegistration.ts` picks `Routes.applicationGuildCommands` vs `Routes.applicationCommands` from it, and `DiscordBot.registerSlashCommands()` logs which scope is live on every boot. **(2)** "Hash the command set and skip the PUT when unchanged" is **not** backed by a locally-persisted hash (no file, no DB table, no schema change) — a first pass tried a file under the container's `$HOME` and got this reworked in review: **merging to `main` deploys**, per AGENT.md, and every deploy is a brand-new container with an empty filesystem, so a locally-remembered hash would be empty on essentially every boot that matters and the whole feature would be a near no-op in production, exactly where it needed to work. Instead, `registerSlashCommands()` does a `GET` on the same route it would `PUT` to, and `hashCommandSet()` (`src/Domain/Bot/CommandRegistration.ts`) hashes both the locally-built set and Discord's response through the *same canonical projection* — only the fields this codebase actually manages, arrays sorted for order-independence, Discord's server-echoed extras (`id`, `application_id`, `version`, defaulted `nsfw`, deprecated `dm_permission`) dropped — and skips the `PUT` when the two hashes match. This survives redeploys for free (the state lives with Discord, not the container) and is strictly more correct than a local record: it also catches drift a local hash could never see, e.g. a manual edit in the Developer Portal or a half-failed previous `PUT`. `contexts`/`integration_types` are excluded from the canonical projection for guild-scoped targets specifically because Discord's API docs mark them "only for globally-scoped commands" — a guild-scoped `PUT` silently drops them, so comparing them there would mismatch every single boot. A failed/unparseable `GET` is logged as a distinct warning (never confused with a `PUT` failure) and falls through to registering unconditionally — "when in doubt, PUT" per this item's own instruction; a failed `PUT` still throws and fails `start()` (M1.4, unchanged). No filesystem write anywhere in this path, which also sidesteps M3.8 (moving the container to non-root) breaking it later. All four top-level commands got `setContexts(InteractionContextType.Guild)` + `setIntegrationTypes(ApplicationIntegrationType.GuildInstall)` + explicit `setDefaultMemberPermissions(null)` — see **M1.10**, same edit, done together. Tests: `tests/Integration/Domain/Bot/CommandRegistration.test.ts` (route selection, hash stability, order-independence of both the top-level array and nested options/choices, a realistic Discord-`GET`-shaped payload with reordering and extra fields hashing equal to the local build, and guild-scope vs global-scope field inclusion), plus a `builder()` assertion in each of the four `*SlashCommand.test.ts` files. |
| **M4.4** | ✅ **DONE (2026-08-20, #28)** — **Lifecycle hardening.** `Events.Error` and shard errors, `process.on('unhandledRejection' \| 'uncaughtException')`, and SIGTERM → `client.destroy()` + `prisma.$disconnect()`. | C6, [06 §6](06-discord-api-modernisation.md) | The container is killed today without either, leaving gateway sessions dangling on every redeploy. |
| **M4.5** | ✅ **DONE (2026-08-20, #28)** — **Replace `DiscordGuildClient`'s second gateway client** with a REST-only `@discordjs/rest` client. | A5 | It lazily constructs and `login()`s a *whole second* `Client` on the same token and never destroys it, so the CLI process holds an open gateway session. Nothing it does (`channels.fetch`, `messages.fetch`, `send`) needs a gateway. |
| **M4.6** | ✅ **DONE (2026-08-20, #28)** — **Client configuration**: `makeCache` limits + sweepers (`messages` and `users` are what grow), and wire the REST client's rate-limit and invalid-request events into the `Logger`. | [06 §5–§6](06-discord-api-modernisation.md) | An invalid-request spike is how you learn you are heading for a Cloudflare ban *before* it happens. Keep the intents minimal — `GatewayIntentBits.Guilds` only is correct and should stay that way until M9.1 genuinely needs `MessageContent`. |
| **M4.7** | ✅ **DONE (2026-08-20, #42)** — **Component routing infrastructure.** | C4, [01 T6](01-marketplace-overhaul.md) | Built as specified, with three deliberate departures from the item's wording. **(1) `ComponentHandler`, not `ButtonHandler`** — one interface covering buttons, select menus *and* modal submissions, because all three arrive as a `customId` and splitting them would have meant three multi-bindings that dispatch identically. **(2) Routing is by *namespace*, not by prefix-match** — `CustomId.ts` owns the `<namespace>:<action>[:<arg>…]` format, and a handler claims a whole namespace (`mkt`) and dispatches internally on the action. Prefix matching would have made `mkt` and `mkt2` ambiguous; exact-segment matching cannot be. Two handlers claiming one namespace **throws** rather than picking the first, so routing never depends on import order in `inversify.config.ts`. **(3) `buildCustomId()` throws past Discord's 100 characters** instead of truncating — a truncated custom ID is a button that routes nowhere when clicked, days later, in production. An **unknown** namespace is *not* an error (components outlive the code that posted them): it is warned and answered with an ephemeral "this button is no longer available", unlike an unhandled slash command, which stays a `BotExecutorError`. The "never trust the `customId`" rule is written into `CustomId.ts`'s module docblock, where the next agent will actually read it. **No component handlers are bound yet** — M5.5/M5.6/M6.5/M7.6 are the first consumers, and the multi-inject is `@optional()` so an empty table is a valid container. |
| **M4.8** | ✅ **DONE (2026-08-20, #42)** — **Autocomplete on both delete commands**, filtered to the invoking user's own records. Positional-index hack deleted. | [06 §3d](06-discord-api-modernisation.md) | `MarketplaceAutocompleteHandler` / `ScreenshotAutocompleteHandler`, matched to a command by `getName()` exactly as `SlashCommandHandler` is. **The positional hack was worse than "fragile"**: `/marketplace delete 2` resolved the position against a *fresh* `ListUserAds` query, so an ad created or expired between the member reading `/marketplace list` and typing the number shifted every position after it — and deleted a different ad than the one they had read. Autocomplete sends the id as the option *value*, so there is no index left to go stale. Because autocomplete has no `deferReply()`, `BotExecutor.executeAutocomplete()` races the handler against a 2s budget and **always** answers (empty on timeout, on a throw, or when no handler matches) — an unanswered autocomplete is what shows a member "This application did not respond" mid-type. `toChoices()` centrally clamps to Discord's 25 choices / 100-character labels, since exceeding either is a 400 that surfaces as a box that silently never populates. Scoping the query to `interaction.user.id` is **convenience, not the boundary** — the option is still free text, so `DeleteAdHandler`/`DeleteScreenshotHandler` still own the ownership check. |
| **M4.9** | ✅ **DONE (2026-08-20, #28)** — **Attachment ingest safety**: cap on `image.size` before fetching, a streamed max-bytes limit, an explicit timeout, and a Discord CDN host allowlist. | A4 — `CreateScreenshotHandler.generateMd5FromImageUrl()` | Currently fetches an arbitrary URL into memory with no cap and no timeout beyond axios defaults. |
| **M4.10** | ✅ **DONE (2026-08-20, #27)** — **Output-size safety**: guard embed limits (25 fields, 1024 chars/field, 6000/embed) and add a 2000-char message chunking helper. | B6, [G7.4](../discord-bot-feature-gap.md) | `ListAdsSubcommand` adds one field per ad with **no cap** — a user with 26 listings breaks the command outright. `ListScreenshotSubcommand` caps at 10. Make it consistent. |

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
| **M5.1** | ✅ **DONE (2026-08-20, #35)** — **Route ads to `📖anuncios`** via `GuildClient` instead of `interaction.reply()`. `SellSubcommand` now sends the listing through `GuildClient.sendMessage(CommunityChannels.MARKETPLACE, …)`; the interaction reply is now a private, ephemeral confirmation with a link to the posted listing, not the listing itself. Post-then-persist (M0.1) kept its shape — one send, one `CreateAd` write holding the real message id. PR [#35](https://github.com/GameOnPortugal/monorepo/pull/35) open on branch `feat/m5-ad-routing` (2026-08-20) — mark done once merged. | [#20](../known-issues.md), [G2.4](../discord-bot-feature-gap.md), [01 T2](01-marketplace-overhaul.md) |
| **M5.2** | ✅ **DONE (2026-08-20, #35)** — **Delete removes the Discord message**, tolerating an already-deleted one, and the row is now soft-deleted instead of hard-deleted. **Design decision**: `GuildClient.deleteMessage(channelId, messageId)` takes the ad's own raw stored `channel_id` rather than a `CommunityChannels` member like `sendMessage`/`getMessageUrl` do — those target one well-known channel this bot manages, but per issue #20 eight production ads live somewhere other than the marketplace channel, and routing delete only through `CommunityChannels.MARKETPLACE` would silently no-op for exactly those rows. Using the row's own `channel_id` cleans up all 70 ads, not just the ones created after this PR. `DiscordGuildClient.deleteMessage` catches Discord's `UnknownMessage`/404 and treats it as success; rows with an empty `message_id` (28 in production, M0.1's orphans) skip the Discord call and go straight to the soft-delete. `OrmAdRepository.delete()` now sets `status='deleted'`/`deleted_at` (cross-cutting rule 2) instead of `prisma.ad.delete()`; `get()` and `findByUserId()` were updated to exclude soft-deleted rows so `/marketplace list` and double-delete behave the same as they did under hard delete. PR [#35](https://github.com/GameOnPortugal/monorepo/pull/35) open on branch `feat/m5-ad-routing` (2026-08-20) — mark done once merged. | [#21](../known-issues.md), [G2.2](../discord-bot-feature-gap.md), [01 T3](01-marketplace-overhaul.md) |
| **M5.3** | ✅ **DONE (2026-08-20, #29)** — **Schema migration**: `status`, `price_cents`, `images`, `bumped_at`, `expires_at`, `sold_at`, `deleted_at`, plus indexes. Backfill `status='active'`, normalise `adType` (`'sale'` → `'sell'`), parse `price_cents` where unambiguous. **Corrected history** (checked directly against production, 2026-08-20 — the wording above and in docs/known-issues.md #22 undersold this): `sell` (35 rows) is what the **old** bot wrote, Nov 2024 – Apr 2025. `sale` (28 rows) is what the **current, rewritten** bot has written for every ad since the April 2025 rewrite — `adType='sale' AND message_id IS NULL` is the exact same 28-row set as the orphaned-`message_id` bug (#0/#1); they are one population, not two. So this was never a one-time historical cleanup: the live write path (`SellSubcommand` → `CreateAd`) was still emitting `'sale'` on every new ad. Migration alone would not have fixed it — the drift would have reappeared on the next `/marketplace sell`. Fixed by normalising in `Domain/Marketplace/Ad.ts` (the one place every `Ad` is constructed) rather than editing `SellSubcommand.ts`, which is owned by a parallel PR (`Infrastructure/Bot/**`). PR [#29](https://github.com/GameOnPortugal/monorepo/pull/29) open on branch `feat/m5-ad-schema` (2026-08-20) — mark done once merged. | [#22](../known-issues.md), [01 T4](01-marketplace-overhaul.md) |
| **M5.4** | ✅ **DONE (2026-08-20, #49)** — **pt-PT copy pass** across every marketplace string, plus `setDescriptionLocalizations`. Covered every string this PR touched — the pre-existing `SellSubcommand`, `ListAdsSubcommand`, `DeleteAdSubcommand`, `MarketplaceSlashCommand`, **and** the new M5.5/M5.6 surface (embed copy, button labels, all six subcommand error/success replies). One deliberate gap against the letter of the item: **Discord's `Locale` enum has no `pt-PT` key at all** — only `Locale.PortugueseBR` (`pt-BR`) exists in `discord-api-types`. `setDescriptionLocalizations()` is called with that key throughout (documented at its one definition, `MarketplaceSlashCommand.ts`'s `PT_LOCALE` constant) since it is the only official tag a pt-BR Discord client will match — the copy underneath it is still written for the pt-PT community this bot serves, not translated to Brazilian Portuguese. Command/subcommand *names* stayed English per settled decision 6. | [#24](../known-issues.md), [G7.11](../discord-bot-feature-gap.md), [01 T5](01-marketplace-overhaul.md) |
| **M5.5** | ✅ **DONE (2026-08-20, #49)** — **Listing embed + buttons** — `💬 Contactar` / `✅ Marcar vendido` / `🔄 Renovar`, colour-coded by type, ad ID in the footer so a row can be recovered from the message alone. Built as the first real consumer of M4.7's `ComponentHandler` infrastructure: `MarketplaceComponentHandler` claims the `mkt` namespace and dispatches on the parsed action (`contact`/`sold`/`bump`/`edit-submit`). Every button customId is built exclusively through `buildCustomId()` (`Domain/Bot/CustomId.ts`) — never string-concatenated — and every handler re-checks ownership/eligibility off the **ad row itself**, never off the customId (see that file's "the custom ID is untrusted input" docblock). One structural addition beyond the letter of the item: `GuildClient` (`Domain/Community/GuildClient.ts`) gained `sendRichMessage`/`editRichMessage`, taking a plain, discord.js-free `RichMessageContent`/`MessageButton` shape rather than a raw `EmbedBuilder`, so the Domain layer stays framework-pure the way `CommunityMessage` already does for reads; `DiscordGuildClient` is the only place that turns it into a real embed + button row. `renderAdListing()` (`Domain/Marketplace/AdListingRenderer.ts`) is the **one** function every poster — `SellSubcommand` (create), the `bump` button/subcommand (repost), `EditAd` (re-render in place) — renders a listing through, so the embed can never drift between call sites, and it is already colour-coded off `ad.adType` so **M5.7's `wanted` needs zero renderer changes**, exactly the "shaped so `wanted` can reuse it" requirement. `💬 Contactar` replies with a `https://discord.com/users/<id>` profile deep-link rather than an `<@id>` mention, specifically to avoid a ping notification while still giving a one-tap path to DM the seller. | [01 T6](01-marketplace-overhaul.md) |
| **M5.6** | ✅ **DONE (2026-08-20, #49)** — **`sold` / `bump` / `edit` subcommands.** Bump rate-limited to once per ad per 72h. `MarkAdSold`/`BumpAd`/`EditAd` (`Application/Write/Marketplace/`) are the **one** place each rule lives — `SoldAdSubcommand`/`BumpAdSubcommand`/`EditAdSubcommand` and `MarketplaceComponentHandler`'s matching buttons both build and dispatch the *same* command object, never a second implementation of the ownership/status/rate-limit checks. `MarkAdSold` is the one action with an admin override (`ManageMessages`, via the existing `isGuildAdmin()` from M1.10) — `bump`/`edit` stay owner-only, matching plan 01's Limits section, which only calls out an admin override for delete/sold. The 72h bump cooldown lives in `Domain/Marketplace/AdBumpPolicy.ts`, reading the `bumped_at` column M5.3 already added. `/marketplace edit` opens a **modal** (`mkt:edit-submit:<adId>`) pre-filled with the current price/description, rather than taking them as slash-command options — the plan's own `06-discord-api-modernisation.md` mapping ("§3c modals → M5.6") calls for this, and `mkt:edit-submit:abc` is the *exact* custom ID M4.7's own `BotExecutorComponentRouting.test.ts` already used as its illustrative example for modal routing, which had no other real caller before this PR. **Did not reuse PR #40's (M6.5/M6.6) lifecycle scaffolding**: that PR — `RenewAd`/`ExpireAd`/`MarkAdPendingRenewal`, `AdLifecyclePolicy`, the `pending_renewal` status — had **not landed on `main`** by the time this branch was cut (`git log origin/main`/`gh pr list` checked first, per this item's instructions), and on inspection answers a different question than `bump` does: PR #40's `RenewAd` only fires from the automatic 14-day-idle-nudge's `pending_renewal -> active` transition, while `BumpAd` here is a self-service "push my still-active listing back to the top", gated purely by the 72h `bumped_at` cooldown, callable any time. Built as a separate `BumpAd` command instead of a naming collision on a second, incompatible `RenewAd`; `Ad.cloneWith()` was likewise written independently of PR #40's `Ad.withChanges()` for the same file-conflict-avoidance reason. **Folded together at integration**, when #40 merged first: one `withChanges()` (main's name, already in use by #40's handlers) taking the *union* of both field sets, with M5.6's `'key' in changes` semantics throughout — those are strictly better, since they let a caller deliberately set a field back to `null` rather than making that indistinguishable from "leave it alone". Two spellings of "copy this entity with edits" is precisely how a field ends up updatable through one path and silently ignored through the other, so they were not left as a pair. | [01 T7](01-marketplace-overhaul.md) |
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
| **M6.2** | ✅ **DONE (2026-08-20)** — **Fix screenshot capture at source**: `CreateScreenshotSubcommand` now posts first (`interaction.editReply()`), then persists with the **real posted message id** — the same post-then-persist fix M0.1 landed for the marketplace listing, mirrored here. `CreateScreenshotHandler` re-hosts through `MediaStorage`/`SafeImageFetcher` (M6.0) at submit time and stores the durable URL, never the Discord CDN one; the MD5-dedup check now runs against the downloaded bytes before any write. `CreateScreenshot.imageSize` (added by M4.9 but never wired) is now populated from the real Discord attachment (`image.size`), giving the pre-download size short-circuit its intended effect. `AttachmentGuard.ts`'s host-allowlist/download/Content-Length checks were removed in favour of `SafeImageFetcher` (the "unify the two" follow-up both files' doc comments promised); only the zero-network `assertReportedSizeWithinLimit` remains. | [#18](../known-issues.md), [#19](../known-issues.md), [02 T2](02-scheduler-and-lifecycle.md) | Verified: stored `1511065198885212340` does not resolve; the real message is `1511065203364860014`. Same root cause as M0.1. Accepted trade-off, matching M0.1's own: a duplicate/failed persist after posting can leave an orphaned public message — the author gets an ephemeral "contact a moderator" reply, same as the marketplace flow. |
| **M6.3** | ✅ **DONE (2026-08-20)** — **`screenshots-relink`** recovery job (`src/Infrastructure/Job/Jobs/RelinkScreenshotsJob.ts`), registered with the M6.1 runner (Saturday 22:00, ahead of the Sunday winner job). Production recon on 2026-08-20 found **two populations, not one**, changing the design from what this row originally described: **Population A** (~614 rows, `image` matches `/attachments/`) already has a correct `message_id` — fetch the message, read the freshly-re-signed `embeds[0].image.url`, re-host it; **no channel scan needed**. **Population B** (~10 rows, `image` matches `/ephemeral-attachments/`) has `message_id` = `interaction.id` (the M6.2 bug) — bounded backward scan of `#screenshots` (20 pages / 2000 messages, reported in `details.populationB.scannedBackTo`), matching **only** on `ID: #<uuid>` in message content, never filename/author/timestamp. `ScreenshotRepository.findRequiringRelink()` (DB-filtered on `image` still pointing at `discordapp.com`) is the main idempotency mechanism — a fixed row drops out of every future candidate page; `MediaStorage.exists()` is a second, per-row check for the crash-window edge case (upload succeeded, DB write didn't), which the job resolves by skipping and reporting rather than fabricating a URL `MediaStorage` has no way to hand back. Sequential processing plus a throttle between Discord calls on top of `@discordjs/rest`'s own 429 backoff. `--dry-run` performs zero writes. Reports the two populations **separately** in `JobResult.details`, including unresolved rows and (population B) scanned-but-unmatched messages. Never deletes — cross-cutting rule 2. | [02 T3](02-scheduler-and-lifecycle.md) | Idempotent, rate-limit-aware, honest reporting of unmatched rows and unmatched messages. First production run should be `--dry-run` first, then bounded batches via `--limit=N` (default work limit 200) rather than one 624-row sweep — see the PR body. |
| **M6.4** | ✅ **DONE (2026-08-20)** — **Hardened `screenshots:winner`** (still unscheduled until M6.1 lands): `findByWeek` *was* using dayjs's locale-default Sunday→Saturday window, not the old bot's Monday→Sunday — fixed and pinned with a boundary test in `Domain/Screenshot/ScreenshotWeekWindow.ts` (explicit Europe/Lisbon assumption, documented in-code). Ties now resolve deterministically to the earliest submission (first to post wins), stable across runs. A screenshot whose message has vanished is skipped and counted, not logged as an error. The old bot's `Concurso DD/MM ABERTO` opening banner is restored (plain text, no image asset ever existed to port). The announcement and banner are now pt-PT. `!give-xp <@user> 1000` is **removed** — confirmed decision, not revisited without someone confirming the receiving bot is still in the guild. `week-screenshot-winner` now supports `--dry-run`, which reports to a new `CommunityChannels.ADMIN` channel instead of posting publicly (ID unverified — set `DISCORD_CHANNEL_ADMIN` before the first supervised run); `bin/console.ts` itself was not touched. | [#3](../known-issues.md), [G7](../discord-bot-feature-gap.md), [02 T4](02-scheduler-and-lifecycle.md) | `screenshots:winner` still finds nothing useful in production until M6.3 (`message_id` repair) lands — this item only hardens what happens once it does. |
| **M6.5** | ✅ **DONE (2026-08-20)** — **`ads:lifecycle`** job (daily 10:00, `src/Infrastructure/Job/Jobs/AdsLifecycleJob.ts`): 14 days idle → prompt (DM with a `Renovar` button) → 72h → **expire, never delete**. | [G5](../discord-bot-feature-gap.md), [02 T5](02-scheduler-and-lifecycle.md) | The old bot's version deleted the row on silence *and* on a closed DM; this keeps the shape, drops the data loss — `ExpireAd` only ever sets `status='expired'` and removes the channel message, never the row. **No schema change**: rather than a new `prompted_at` column, the "awaiting a response" state is `status='pending_renewal'` (added to `AdStatus`'s fixed set) plus `expires_at` *repurposed* as the response deadline while in that status (previously only ever the 30-day backfill value from M5.3) — evaluated and rejected a `prompted_at` column mid-build once it was clear `status` + `expires_at` could carry the same information with one fewer column, per the "prefer no schema change" cross-cutting guidance. **The first-run mass-expiry/mass-DM problem** (M5.3's backfill left all 70 production ads looking idle since `bumped_at` is null and `createdAt` predates the 14-day window): `MAX_NEW_PROMPT_RECIPIENTS_PER_RUN = 5` in `AdsLifecycleJob.ts` caps *distinct newly-DM'd recipients* per run, independent of and much smaller than `context.workLimit` (which bounds total items touched); at one run/day, a backlog of any realistic size clears over a few days of small, unremarkable DM batches instead of one storm. The 28 empty-`message_id` legacy rows are expired directly with no DM at all (settled decision, plan 02 decision 4) via a distinct `orphaned` bucket, which also shrinks the recipient pool. **Operator runbook for the first production run**: `bun run:command jobs:run ads-lifecycle --dry-run` first, read the `considered/changed/skipped/failed` counts and the `details` breakdown (`expiredOrphaned`, `expiredNoResponse`, `prompted`, `recipientsDmed`, `recipientsDmClosed`, `recipientsSkippedGrace`) in the log line, and only then let the daily schedule run for real — `recipientsSkippedGrace > 0` on a dry run is expected and means the grace cap is doing its job, not a bug. **One DM per user, not per ad** — the idle bucket is grouped by `authorId` in-memory before sending. **A closed DM** (`GuildClient.sendDirectMessage` returns `null` — privacy settings or a block, not distinguished) **never expires anything**; it's logged, counted in `details.recipientsDmClosed`, and the ad is retried on a later run once idle again. **Renewal bumps the same row**: `RenewAdHandler` (`Application/Write/Marketplace/RenewAd/`) deletes the old channel message, posts a fresh one, and updates the same `AdId` — `channelId`/`messageId`/`bumpedAt` change, `expiresAt` clears to `null`, `status` returns to `active`; no new row is ever created. **Buttons, not reactions**: the DM ships one `Renovar` button per idle ad, `customId` scheme `mkt:renew:<adId>` — see the **M4.7** row for the still-outstanding click-handler wiring; `RenewAdHandler` already re-checks ownership off the row (`ad.authorId !== userId`), by design never trusting the `customId`. pt-PT copy throughout (`buildRenewalPrompt` in `AdsLifecycleJob.ts`, `buildRenewedListingContent` in `RenewAdHandler.ts`). |
| **M6.6** | ✅ **DONE (2026-08-20)** — **`ads:reconcile`** job (daily 03:00, `src/Infrastructure/Job/Jobs/AdsReconcileJob.ts`): walks every `active` ad and, for the ones with a real message, checks it still exists via the new `GuildClient.messageExists(channelId, messageId)` (raw channel id, same reasoning as `deleteMessage` — 8 of 70 production ads are outside `#anuncios`, 3 in a DM channel) and marks a vanished one `expired` via the same `ExpireAd` command M6.5 uses. Catches moderator deletions and (defensively) M0.1's orphan case. | [02 T6](02-scheduler-and-lifecycle.md) | **The 28 empty-`message_id` rows are counted separately** (`details.orphaned`) **and never reported as vanished** (`details.vanished`) — there is nothing to check for them, so no `GuildClient` call is even made; `ads:lifecycle` (M6.5) is what actually expires them, on its own schedule. `--dry-run` computes and reports `details.vanished` without calling `ExpireAd`. Scoped to `status='active'` only, per the item's literal wording — an ad already `pending_renewal` whose message vanishes mid-window is not reconciled directly, but still gets swept by `ads:lifecycle`'s next 72h-silence check regardless (its `ExpireAd` call tolerates an already-missing message the same way `deleteMessage` always has), so nothing is permanently missed, just on a slightly longer path. |
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
| **M7.1** | ✅ **DONE (2026-08-20, #24)** — **Port the PSNProfiles crawler** behind a `TrophySource` domain port — platinum rarity + completion date (incl. the blank-first-row workaround and "not earned yet" detection), profile world/country rank, paginated platinum lists. Respect robots and rate limits; cache; back off. | [#10](../known-issues.md), [G11 / §4.1](../discord-bot-feature-gap.md) |
| **M7.2** | ✅ **DONE (2026-08-20, #24)** — **Port the points engine** — the rarity→TP ladder (>30.01% = 50 TP … ≤0.6% = 2000 TP) and `TrophyAlreadyClaimedException` (one claim per profile+URL). | [§4.2](../discord-bot-feature-gap.md) |
| **M7.3** | ✅ **DONE (2026-08-20)** — **`trophies:sync` job** (`TrophiesSyncJob`, registered `*/10 * * * *`, matching the old `@every 10m`). Catch-up mode walks each non-excluded profile's platinum trophies newest-first and stops at the first already-claimed one (`TrophyRepository.existsByProfileAndUrl` pre-check, `create()` also enforces it via `TrophyAlreadyClaimed` as defense-in-depth against a race). Auto-moderation ported verbatim: no visible world/country rank → `isBanned` + `isExcluded`; the linked Discord account no longer in the guild → `hasLeft` + `isExcluded` (new `GuildClient.isGuildMember`, wrapping Discord error 10007 in `DiscordGuildClient`). Both flags write via the existing `TrophyProfileRepository.save` — no new repository methods were needed for that part, `findAllNonExcluded` was the one addition, and a flagged profile simply stops being returned by it on the next run. `--dry-run` never calls a writing repository method. **Design deviation from the plan's `--all --profile=X` CLI flag**: `JobContext` (Domain/Job/Job.ts, out of this PR's scope, other agents editing `JobRunner`/`RunJobConsoleCommand` in parallel) only carries `dryRun`/`workLimit` with no channel for extra flags, so the full-rescan override is instead two environment variables read by the job itself via an optional second `run()` parameter defaulting to `process.env`: `TROPHIES_SYNC_ALL=true TROPHIES_SYNC_PROFILE=<psnProfile> bun run:command jobs:run trophies:sync`. Because `bin/console.ts` exits after one run, this can't leak into the schedule. **Politeness**: no throttling added here on top of M7.1's `PsnProfilesTrophySource` (1 req/s, descriptive UA) and `RetryHttpClient` (backoff on non-2xx, covers 429/5xx); this job adds a work-limit *budget* — every PSNProfiles/Discord-bound call spends one unit of `context.workLimit`, so a run over ~118 profiles is bounded and resumable, with untouched profiles reported `skipped`, not dropped. Newly-flagged profiles are reported separately in `JobResult.details.newlyFlagged`, not folded silently into `changed`. **Blast-radius review (2026-08-20)**: merging to `main` deploys, so the job's scheduler registration is gated behind `TROPHIES_SYNC_ENABLED=true` (unset by default) — the job is always bound and always runnable by hand (`bun run:command jobs:run trophies:sync --dry-run`), but production only schedules it once an operator has reviewed a dry run; `inversify.config.ts` logs clearly at boot when it's off, mirroring the `DISCORD_TOKEN`-unset log M1.3 added. Moderation writes also gained a safety valve: flag decisions are deferred (`pendingFlags`) until the whole run's batch is known, and a batch bigger than `MODERATION_SAFETY_VALVE_THRESHOLD` (10 — see the constant's doc comment in `TrophiesSyncJob.ts`) is treated as a broken PSNProfiles parser rather than a mass exodus and is logged loudly, reported in `JobResult.details`, and **not written**; trophy-row creation for the rest of the run is unaffected. **First production run runbook**: (1) deploy with `TROPHIES_SYNC_ENABLED` unset — nothing is scheduled; (2) `bun run:command jobs:run trophies:sync --dry-run` and read the report, especially `details.newlyFlagged`; (3) optionally a bounded live run with a small `--limit`; (4) set `TROPHIES_SYNC_ENABLED=true` once the numbers look sane — ongoing per-run summaries post to `#⚛server-log` (M6.8's `DiscordJobReporter`, `DISCORD_CHANNEL_ADMIN`). | [§4.3](../discord-bot-feature-gap.md) |
| **M7.4** | ✅ **DONE (2026-08-20)** — **`/trophy check` shows live world/national rank again** via `TrophySource.getProfileRank`, injected directly into `CheckTrophyProfileSubcommand` (Infrastructure depending on a Domain port — the job's the only other consumer so far). Banned/left profiles get their own pt-PT message instead of a live lookup (nothing current to show; a banned-profile lookup would just cost a request to reconfirm a flag already known); a live-lookup failure degrades to an apologetic line rather than failing the whole embed. Whole embed translated to pt-PT (cross-cutting rule 1) while touching it, including the shared `TrophySlashCommand` fallback strings — `RankSubcommand` itself (M7.6, out of scope here) was left untouched. | [§4.5](../discord-bot-feature-gap.md) |
| **M7.5** | ✅ **DONE (2026-08-20)** — **`/trophy create` accepts both URL shapes.** New pure `Domain/Trophy/PsnProfileUrl.ts#extractPsnProfileFromUrl`, ported from the old bot's regex-plus-split `getPsnProfileByUrl`, replacing `CreateTrophyProfileSubcommand`'s own bare-profile-only parser. Table-driven test (`tests/Integration/Domain/Trophy/PsnProfileUrl.test.ts`) over both accepted shapes plus malformed/lookalike input (wrong host, lookalike host, http instead of https, missing segments, trailing slash, too many segments). Rejection message and success message translated to pt-PT. | [§4.6](../discord-bot-feature-gap.md) |
| **M7.6** | ✅ **DONE (2026-08-20, #50)** — **Rank presentation parity.** This row previously said "needs M4.7" — stale by the time this was picked up, M4.7 (component routing) had already landed as #42; corrected here. **Emojis**: new `RankEmoji.ts#formatRankPositionEmoji`, position 1/2/3 get the guild's plat/gold/silver custom emoji (the same hardcoded ids `DiscordEmoji.ts` already carried, ported from the old bot's `emojiEnum.js`), every other position gets bronze — and every position falls back to a unicode medal (🥇🥈🥉🏅) if its configured id is ever empty, so a misconfigured/blanked id degrades to a readable fallback instead of a dead `<:name:>` mention. **Pagination**: `trophies` is the first real namespace bound to the M4.7 `ComponentHandler` table (`TrophyComponentHandler`, custom ID `trophies:page:<type>:<page>:<pageSize>:<month>:<year>`, built only via `buildCustomId()`). Two design calls, both made rather than asked: **(1) the reply stays ephemeral** (it already was, pre-M7.6) — that setting alone is what keeps a paginated leaderboard from being shared state, since Discord only shows an ephemeral message's components to the member who triggered it, so a click can never belong to anyone else's render; no customId-encoded user check was added because there is nothing to check, and `CustomId.ts`'s warning against treating an encoded id as authorisation does not even apply here — there is no ownership concept on a public leaderboard page. **(2) The custom ID carries the entire page state** — type, target page, page size, and (for monthly) the *resolved* month/year, not the relative `current`/`last` the slash command accepts — so a click reconstructs the exact same query after a bot restart with no store, and clicking "next" a month after the message was posted still pages the month it was originally opened on, not whatever month is now current. Every decoded field is defensively parsed (`TrophyComponentHandler#decode`) and the requested page is never trusted as in-range: `GetRankHandler` now computes `totalPages` from a new `countMonthlyHunters`/`countSinceCreationHunters`/`countLifetimeHunters` trio and clamps into `[1, totalPages]` before running the paginated `getTop*Hunters(limit, offset)` query (offset appended as an optional trailing param, so every pre-M7.6 positional call site kept compiling) — a page number past the end (leaderboard shrank after the message was posted) lands on the last real page with data, never an empty embed or a throw. Both Prev/Next buttons are always rendered for a list rank type, even on a single-page ranking, disabled rather than omitted, so pagination's presence/absence is never ambiguous. **`limit` kept, repurposed as page size** (still 1–10, still optional, default 10) rather than removed — "show me 3 at a time" is a real preference and costs nothing once every subsequent page's button carries it forward in its own custom ID. `RankSubcommand`'s embed and error copy translated to pt-PT while touched (cross-cutting rule 1), matching M7.4. Shared embed/button construction lives in `RankPresenter`, used by both `RankSubcommand` (the initial command) and `TrophyComponentHandler` (every subsequent page), so the two can never render a page differently depending on how it was reached. | [§4.7](../discord-bot-feature-gap.md), C4 |
| **M7.7** | ✅ **DONE (2026-08-20)** — **`trophies:fix-old` backfill**, a manual **console command** (`src/Ui/Cli/FixOldTrophies.ts`), not a scheduled Job. **Decision**: unlike `trophies:sync`, nothing produces a fresh crop of null-`completionDate` rows on an ongoing basis — `trophies:sync` itself always sets `completionDate` when it creates a trophy, so null rows are a historical/import artefact, not a recurring condition; once backfilled there is nothing left for a schedule to do. Mirrors the old bot's own one-off-script shape. Idempotent (only ever selects rows still missing a date) and bounded (`--limit=N`, default 100); supports `--dry-run`. New `TrophyRepository.findMissingCompletionDate`. | [§4.4](../discord-bot-feature-gap.md) |
| **M7.8** | ✅ **DONE (2026-08-20, #46)** — **Trophy announcements through the bot, not a webhook.** `TrophiesSyncJob` posts "Parabéns \<@user\>! Acabaste de receber N TP (Trophy Points) pelo teu troféu: \<url\>" via `GuildClient.sendMessage(CommunityChannels.TROPHIES, ...)` right after a trophy is created — no separate job, no webhook. `TROPHY_WEBHOOK` was already gone from `.env.example`/compose (an earlier pass cleared it) — verified, nothing left to delete. **M1.7 config decision**: M1.7 itself hasn't landed yet, so rather than block on it this PR does the simplest honest thing the item's own text allows — a new `DISCORD_CHANNEL_TROPHIES` env var, resolved the same way `SCREENSHOTS`/`MARKETPLACE`/`ADMIN` already are in `DiscordChannels.ts`. Unlike those three, it has **no verified default** — nobody has confirmed a real channel for trophy announcements, so `DISCORD_IDS_DEFAULTS.TROPHIES` is `''` and `convertChannel` throws a clear, caught-and-logged error until an operator sets it, the same defensive shape already used for a blanked-out `ADMIN`. **Flood-guard design** (the hard part of this item, per the brief: a first run against a fresh/reconnected profile must not spam the channel): three independent, stacked guards, documented in full in `TrophiesSyncJob.ts`'s "Announcements, and their flood guard" doc comment — (1) **`TROPHIES_ANNOUNCE_ENABLED`** (env, default unset/off), mirroring `TROPHIES_SYNC_ENABLED`'s reasoning: merging to `main` deploys, so a feature that posts publicly must be an operator's opt-in, not a side effect of this PR landing — this alone guarantees the very first run posts nothing; (2) **per-profile batching** — a single profile's walk creating more than `TROPHIES_ANNOUNCE_BATCH_THRESHOLD` (3) new trophies in one run collapses to **one** summary message ("Sincronizámos N troféus novos, num total de X TP…") instead of N individual ones, covering the "profile reconnects after months away" backlog case; (3) a **per-run cap** (`TROPHIES_ANNOUNCE_MAX_MESSAGES_PER_RUN`, 10) across the *whole* run, covering the "operator flips the flag on for the first time against many profiles that already have unannounced trophies" case — trophy creation itself is never affected by any of these, only the announcement is skipped, and always loudly (`trophies:sync.announce.suppressed`, folded into `JobResult.details.announcements`). A failed post (Discord down, misconfigured channel, rate limit) is caught and logged per-message and never fails the profile or the run; `--dry-run` never announces, since an announcement is only queued inside the same `!context.dryRun` branch that calls `TrophyRepository.create`. New tests in `tests/Integration/Infrastructure/Job/Jobs/TrophiesSyncJob.test.ts` (`describe('announcements (M7.8)')`) cover: off by default, dry-run never announces, a small batch posts individually, a backlog collapses to one summary, the per-run cap suppresses without failing the sync, and a failed send is logged but non-fatal. | [§7.7](../discord-bot-feature-gap.md), [#8](../known-issues.md) |

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

| ID | Item | Status |
| -- | ---- | ------ |
| **M8.1** | Vendor the brand — guild icon + banner into the repo, trace an SVG, define design tokens. **There is no logo file in this repo today**; `webpage/assets/img/logo.png` is referenced by `index.html` and does not exist. | **Design tokens done as part of M8.5 ([#48](https://github.com/GameOnPortugal/monorepo/pull/48)); the brand art itself is still not vendored.** `portal/web/src/index.css`'s `@theme` block defines the full palette/type-scale/chamfer/scanline tokens from plan 03 and 00-overview's hex values, and `portal/web/src/lib/platforms.ts` fixes the platform→colour assignment in one place (with the WCAG contrast numbers that justify it). What's still missing, and why: the guild icon (`https://cdn.discordapp.com/icons/818108848492773377/b5d2486a6181a2a5ecb3a4cfbc4b9a0d.png?size=512`) and banner (`https://cdn.discordapp.com/banners/818108848492773377/ffa308a0fad1a858794921dec051bad5.png?size=1024`) are binary image assets an agent restricted to text-editing/Bash tools cannot fetch and trace to SVG. `portal/web/public/favicon.svg` is a plain placeholder (documented as such in its own header comment) and the header wordmark is set text (`font-display`), not a traced logotype. **Next agent**: fetch the two URLs above, trace/vectorise the icon, vendor both into `portal/web/public/brand/`, and swap the text wordmark for the real mark in `portal/web/src/components/Layout.tsx`. |
| **M8.2** | Add `portal-api` / `portal-web` to release-please config **and** manifest, and uncomment their services in `infrastructure/game-on-portugal.yaml` — in the same PR that creates the directories (release-please errors on a package path that does not exist). | ✅ **DONE ([#48](https://github.com/GameOnPortugal/monorepo/pull/48)).** Both components added to `.github/release-please-config.json` (`node` release-type, paths `portal/api`/`portal/web`) and `.github/.release-please-manifest.json` (seeded `0.1.0`), and both services uncommented in `infrastructure/game-on-portugal.yaml`. **One addition beyond the item's literal wording**: uncommenting the services with no image-build path wired up would have broken the *next* deploy — Portainer fails a stack whose image can't be pulled, and that failure isn't scoped to the new services, it takes the whole stack rollout down, including the bot. So `deploy.yml` gained `build-portal-api`/`build-portal-web` jobs (same shape as the existing `build-bot`), and `deploy`'s trigger paths gained `portal/**`. Trade-off recorded rather than hidden: `deploy.yml` has no per-job path filtering (unlike `ci.yml`'s `changes` job), so any push to `main` touching `discord-bot/**`, `portal/**` or `infrastructure/**` rebuilds and pushes **all three** images, not just the one that changed — matching the existing simplicity of that workflow rather than introducing new filtering machinery in a scaffold PR. `ci.yml` and `docker-build.yml` got their own `portal-api`/`portal-web` lanes gated on `dorny/paths-filter`, so PRs only run the jobs relevant to what changed. `.github/labeler.yml` and `.github/workflows/pr-title.yml` already had `portal`/`portal-api`/`portal-web` entries from an earlier session — verified, nothing to add there. |
| **M8.3** | Scaffold `portal/api` (Bun + Hono) with read-only endpoints. **The bot owns the schema**; the portal reads it and never runs migrations. | ✅ **DONE ([#48](https://github.com/GameOnPortugal/monorepo/pull/48)).** Bun + Hono, endpoints for `/health`, `GET /api/marketplace/ads[/:id]`, `GET /api/screenshots`, `GET /api/trophies/leaderboard` (the leaderboard replicates `OrmTrophyRepository.queryRankedHunters`'s SQL shape — same `isExcluded` filter, same `points DESC, trophyCount DESC, psnProfile ASC` tie-break — as a separate implementation, since the portal never imports bot `Application`/`Domain` code). **Schema sharing, the interesting part**: `portal/api` does not copy `discord-bot/prisma/schema.prisma`. `bun run db:generate` runs `prisma generate --schema=../../discord-bot/prisma/schema.prisma`, and because Prisma's *un-overridden* client output path resolves relative to the schema file rather than the invoking package, the generated client lands in `discord-bot/node_modules/@prisma/client` — the literal artifact the bot uses, not a copy, reached via a relative import from `portal/api/src/db.ts`. Verified working end-to-end, including in Docker (repo-root build context, see `portal/api/docker/Dockerfile`'s header). The one operational cost of this approach: `discord-bot` and `portal/api`'s `prisma` devDependency versions must be pinned **exactly** equal (not `^`), or `generate` fails with a missing-runtime-file error — documented in `portal/README.md` and `portal/api/src/db.ts`. Every repository query is read-only by convention (`findMany`/`findUnique`/`$queryRaw*` only — no Prisma write method appears anywhere under `src/`); there is no database-level enforcement yet (the portal-api service currently reuses the bot's root DB user — see `portal/README.md` "Known limitation"). Public read paths are shaped for the still-unbuilt M9.7 `public_opt_out` flag: every query builds its `WHERE` through `src/repositories/visibility.ts`, so honouring the flag later is a one-line change to three functions, not a route-by-route rewrite. Tests: 9 cases across 4 files (`portal/api/tests/`), covering visibility filtering (soft-deleted ads absent, excluded trophy profiles absent, zero-trophy profiles absent per the `INNER JOIN` semantics) and that no response ever leaks `author_id`/`channel_id`/`message_id`/`userId`. **M8.4 (the shared normalisation module) is explicitly not done here** — `adType`/`state`/`plataform` are returned raw, with a comment pointing at M8.4 as the follow-up. |
| **M8.4** | **Shared normalisation module** — 21 platform strings → 4 platforms + Other; legacy Portuguese conditions → the enum; zone → district; `price_cents`. Used by **both** bot and portal so a listing renders identically in Discord and on the web. Map at display time; never rewrite history. | ✅ **DONE ([#56](https://github.com/GameOnPortugal/monorepo/pull/56)), portal-side only.** `portal/web/src/lib/normalize.ts`: `normalizePlatform` (21 documented raw strings → `playstation`/`xbox`/`nintendo`/`pc`/`other`/`null`, keyword-matched and diacritic/case-insensitive — `other` for a recognised-but-uncategorisable value, `null` only for missing input, so nothing silently vanishes), `normalizeCondition` (legacy Portuguese free text — `Novo/Selado`, `Como novo`, `Muito Bom`, plus the already-enum values — onto `AdListingRenderer.ts`'s five-value condition enum; `Qualquer um`/`Versão digital`/`Não` deliberately map to `null` rather than a misleading enum value, since they answer a different question), `normalizeZone` (free text → one of the 20 PT districts, or `Online`, or `Outra` — picks the first token of a `/`-separated multi-answer like `Braga/Porto`), and `formatPrice` (`price_cents` → `Intl.NumberFormat("pt-PT")` currency string, falling back to the raw `price` text, then an honest "Preço não indicado"). 44 unit tests (`portal/web/tests/normalize.test.ts`) cover every example string documented in `00-overview.md`/`known-issues.md` (there is no literal enumerated list of all 21 raw strings anywhere in the repo, only representative examples — covered those plus the input shapes they imply: case, spacing, "series S/X" suffixes). `platforms.ts`'s `guessPlatform()` stand-in is removed; `PlatformBadge` now accepts the `other` bucket with a plain muted outline instead of inventing a fifth brand colour (plan 03: "the four button colours ARE the platform palette"). **Scope departure from the item's literal wording, per this agent's task brief**: implemented in `portal/web` only, not shared with the bot — another agent was working in `discord-bot/` concurrently, so touching bot source was off-limits. Bot-side adoption (import via a future shared workspace package, or hand-porting the same rules into `AdListingRenderer.ts`'s `STATE_LABELS` equivalent) is real follow-up work, not done here — a listing can still render slightly differently between Discord and the web (e.g. an unrecognised platform string) until that lands. |
| **M8.5** | Scaffold `portal/web` (Vite + React + Tailwind), mobile-first at 375 px. | ✅ **DONE ([#48](https://github.com/GameOnPortugal/monorepo/pull/48)).** Vite 8 + React 19 + Tailwind v4 (CSS-first `@theme` config, no `tailwind.config.js`), `react-router-dom` for the shell, `@fontsource`-self-hosted webfonts (Archivo Black for `font-display`, Inter Variable for `font-body` — no third-party font CDN). Dark-first with no light theme (per the settled decision), chamfered-corner and low-opacity scanline utilities, focus-glow instead of outlines, a global `prefers-reduced-motion` override. **The platform→colour mapping lives in exactly one file**, `src/lib/platforms.ts` — PlayStation→blue, Xbox→mint, Nintendo→red, PC→yellow (reasoning and a WCAG contrast table for all four accents against `#060302` are in that file's header). Contrast was verified, not assumed: white-on-accent fails AA for **every one** of the four colours (worst: yellow at 1.08:1), so `PlatformBadge` uses near-black text on the accent fill, and body copy never uses an accent as a text colour on black (`#EA3223` is 4.87:1 against black — technically AA-passing but marginal, per plan 03 — so even the one place that seemed safe, error-copy, uses a red left border with white text instead). One representative page (`src/pages/Home.tsx`) is built end-to-end against the real API — hero, ads/screenshots/leaderboard strips with loading/error/empty states — as the pattern for M8.6-M8.9 to copy; it is a skeleton of the eventual M8.6 Home page, not the finished thing. `bun run build` and `bun run typecheck` are both clean; production API calls default to same-origin `/api/...` (not a build-time-baked host) because the deploy topology already on disk (`infrastructure/caddy/game-on-portugal.pt.caddy`) has the SPA container's own nginx proxy `/api/` and `/health` to `portal-api` — `portal/web/docker/nginx.conf` implements that split, verified by running both containers together on a shared Docker network. |
| **M8.6** | Home page — hero, live stats, latest screenshots, newest listings, Discord CTA. | ✅ **DONE ([#56](https://github.com/GameOnPortugal/monorepo/pull/56)).** Builds on M8.5's skeleton: hero unchanged; a new live-stats bar backed by a new endpoint, `GET /api/stats` (`portal/api/src/repositories/stats.ts`) — active ads, screenshots, trophies, and "trophy hunters" (distinct non-excluded profiles with ≥1 trophy, same `INNER JOIN` semantics as the leaderboard). **Deliberately no member count**: `portal-api` holds a database connection only, no Discord bot token, and makes no Discord API calls (see that file's header comment) — a live guild member count is not obtainable from this service, so the stat bar shows what the data can actually support instead of faking a number. Latest-screenshots and newest-listings strips now link into the real M8.7/M8.8 pages and use the shared `AdCard`/`LazyImage` components those pages also use, instead of M8.5's dead-end preview tiles. Handles the task brief's sparse/stale case honestly — newest screenshot is from 2026-06-01 (~90 days stale) and the active-ad count is small post-expiry — via plain-language empty states, no seeded content. |
| **M8.7** | Marketplace pages — grid, filters, detail. | ✅ **DONE ([#56](https://github.com/GameOnPortugal/monorepo/pull/56)).** `/marketplace`: grid of `AdCard`s with type (sell/wanted), platform, condition, zone and price-sort filters. `/marketplace/:id`: image strip, description, normalised platform/condition/zone/dispatch tags, "Contactar no Discord". **Filtering is client-side**, over one `GET /api/marketplace/ads?limit=200` call, not server-side — platform/condition/zone filters need M8.4's normalisation, which lives in `portal/web` only (see that row); teaching `portal/api` to filter by *normalised* values would mean duplicating the M8.4 mapping server-side. At the current active-ad count (~40, after the 28 the task brief says were just expired) this is simpler and correctness-equivalent to a server-side filter; flagged here as a scaling follow-up if the active set grows an order of magnitude, not a correctness gap today. **"Contact on Discord" is a plain invite link, not a deep link to the ad's own message** — `portal/api`'s ads repository (M8.3) deliberately never returns `channel_id`/`message_id` (privacy decision 5 groups them with raw user IDs, see that repository's header comment), so there is nothing to link to even if this page wanted to. Recorded as a scope decision, not an oversight. |
| **M8.8** | Screenshots gallery + Hall of Fame. **Blocked on M6.3.** Thumbnails at ingest — a phone must not download a 4 MB PNG per grid tile. | ✅ **DONE ([#56](https://github.com/GameOnPortugal/monorepo/pull/56)), with one real gap left open.** M6.3 (relink recovery) landed weeks earlier, so this was unblocked. `/screenshots`: grid with a platform filter, a "carregar mais" button over a client-held pool (see below), and a keyboard-navigable `Lightbox` (Esc closes, arrow keys move, click-outside closes). `/screenshots/hall-of-fame` exists as its own route. **Thumbnails — the gap**: neither ingest-time WebP generation nor an on-the-fly resize proxy was buildable from this agent's scope (no `discord-bot/` changes, no `infrastructure/` changes — both explicitly off-limits in the task brief). What's built instead, `LazyImage` (`portal/web/src/components/LazyImage.tsx`): an `IntersectionObserver`-gated mount that never requests an image until it's within 200px of the viewport, so a 624-tile gallery does not fire 624 simultaneous requests. That file's header is explicit this is a **request-count mitigation, not a bytes-per-image one** — the true fix (WebP thumbnails at ingest, per plan 03 decision 2, or an imgproxy-style service) still needs bot or infra work and is a concrete follow-up, not done. **Broken images**: `LazyImage` swaps to a "Sem imagem" placeholder on `<img onError>`, covering the two dead 2022 Discord CDN links the task brief flagged (622/624 re-hosted to MinIO) and any future ones — a row with a dead image still counts and still appears, it doesn't vanish from the grid or the total. **Hall of Fame is an honest placeholder, not a ranking** — verified against `discord-bot/src/Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinnerHandler.ts` that the weekly winner is computed live from Discord reaction counts on each `WeekScreenshotWinnerJob` run and is **never persisted**: no `isWeeklyWinner`/`wonAt` column on `Screenshot` (checked `discord-bot/prisma/schema.prisma`), no separate winners table. The database holds no history for this page to query. Building a real one needs a bot-side schema change to persist a winner flag/table at selection time — `discord-bot/prisma` is explicitly off-limits for this agent (another agent was in `discord-bot/` concurrently). Fabricating a ranking from `createdAt` or reaction-less heuristics would misrepresent real winners as data, which the task brief's "do not seed fake content" rules out just as much as literal seed rows — so the page says so plainly and links to Discord, where the real weekly announcement happens today. Recorded here as the concrete next step. |
| **M8.9** | Trophies leaderboard, with an honest "data frozen" notice until M7 lands. | ✅ **DONE ([#56](https://github.com/GameOnPortugal/monorepo/pull/56)).** `/trophies`: rank, PSN profile, summed points, trophy count, against the real `GET /api/trophies/leaderboard` (M8.3), which mirrors `OrmTrophyRepository.queryRankedHunters`'s SQL shape (same `isExcluded` filter, same tie-break order) — so this page's numbers match `/trophy rank` for the same query by construction, not by coincidence. **No "data frozen" notice** — this row's own original wording (and plan 03's pages table) called for one, but M7 (the trophy sync port) landed **the same night**, verified against this PR's own task brief and the M7 row above (all of M7.1–M7.8 ✅, 8/8) — a stale-data banner here would now be actively wrong, not just outdated, so it was left out on purpose and replaced with a soft "sincronizado periodicamente… pode estar alguns minutos atrás do Discord" line instead. Top-3 highlighting uses a left border, not text colour, for rank 3 specifically — `platforms.ts`'s own contrast table calls red "technically AA-passing but marginal" as text, and M8.5 already drew the line of keeping it out of text entirely; this page follows that same line rather than reopening it. Per-profile pages (mentioned in plan 03's pages table, not in this row's own wording) were not built — out of this row's stated scope. |
| **M8.10** | Discord OAuth + admin shell, gated on guild membership **and `ManageMessages`** — the same definition of "admin" the bot uses. | — |
| **M8.11** | Admin CRUD + audit log. | — |
| **M8.12** | Admin jobs page, wired to M6.1's runner. | — |
| **M8.13** | SEO, OG cards, sitemap. | — |
| **M8.14** | Deploy + CI, documented in `operations.md`. | — |
| **M8.15** | **Plan 04 phase 4** — point the `game-on-portugal.pt` apex and `www` at HTZ1 (and **refresh the OVH zone**, which applies the zone, not the record), add the apex Caddy block, archive `GameOnPortugal/gameonportugal.github.io`, and delete this repo's orphaned `webpage/`. Resolves [#9](../known-issues.md). | — |

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
| **M9.1** | ✅ **DONE (2026-08-20, #51)** — **Channel rules — reimplemented as Discord AutoMod, not a message pipeline.** Define the guild's AutoMod rules (keyword/regex blocking) as checked-in JSON applied through `@discordjs/rest`, and express "commands only" channels as channel *permissions* (deny `SendMessages`, allow `UseApplicationCommands`) rather than deleting messages after the fact. | [G16 / §6.1](../discord-bot-feature-gap.md)  **Blocklist decided 2026-08-20 — there is nothing for this repo to hold, and that is the finished state, not a TODO.** The live guild (818108848492773377) was queried directly: it already runs **five enabled AutoMod rules**, all hand-made in the Discord UI by a moderator — `Custom Keyword Rule` (1 keyword; block + alert + 60s timeout), `Commonly Flagged Words` (Discord presets 1/2/3), `Block Spam Content`, `Block Mention Spam`, and `Sharing links - non verified` (7 keywords, **3 exempt roles**). That is a real curated policy, written by people who know the community. It stays where it is. `config/automod-rules.json` therefore ships with `rules: []` — the placeholder rule was **removed**, since a disabled rule named "do not enable" is just an invitation to enable it, and `--apply` would have created a junk rule in the guild for no reason. **Mirroring the five here would have been actively worse**: two sources of truth for one policy, and they would fall under this reconciler's management, so a later `--apply` would silently revert whatever a moderator had changed in the UI. Nothing here can reach them — reconciliation only touches names carrying the `[gop-managed:<key>]` marker, none of the five match, and `AutoModPlan.test.ts` pins that as a property including under `--prune-orphaned`. `commandsOnlyChannels` stays empty too: the old bot's equivalent `specialchannels` table held **0 rows** in production, so there was never a configuration to port. The mechanism earns its place for rules that need to be reviewable in git or applied identically across guilds; day-to-day moderation belongs in the UI, where a moderator can change it without a deploy. | **Redesigned — see decision 4. Mechanism only — nothing applied to the live guild; three decisions below are still Luis's to make.** The straight port needed the `MessageContent` privileged intent and a message-event pipeline the rewrite does not have, and it contradicted M4.6's minimal-intents position. AutoMod does the same job server-side, with no intent, no gateway traffic, no bot latency, and it keeps enforcing while the bot is down. The `specialchannels` table was **empty** — dropped along with the M9.2/M9.3/M9.4 models in migration `20260820102655_drop_dead_models` (M9.6's schema half, 2026-08-20). Built as `discord-bot/config/automod-rules.json` (checked-in config) reconciled by a new console command, `automod:apply` (`src/Ui/Cli/ApplyAutoModConfig.ts`), against one new port covering both halves of the item: `AutoModClient` (`Domain/Community/AutoModClient.ts`, REST-only per M4.5's pattern, implemented by `DiscordAutoModClient.ts`) — rule CRUD for the AutoMod half, `getEveryoneChannelOverwrite`/`putEveryoneChannelOverwrite` for the "commands only" channel-permission half. Four departures worth recording, same shape as the M4.7 row: **(1) Safe-by-default the opposite way round from this repo's usual `--dry-run` convention** — no flag at all means dry-run; reconciliation needs an explicit `--apply`. The item's own non-negotiable ("an accidental run must not be able to silently widen or wipe the guild's moderation") reads more safely as "nothing happens unless you ask" than as "remember the flag". **(2) A manual console command, not a Job** — M6.1's runner is for things that should happen on a schedule; applying moderation config is the opposite of that, so it is bound in `inversify.config.ts` and `bin/console.ts` exactly like `trophies:fix-old` (M7.7), never registered with `JobRunner`. **(3) Reconciliation is namespaced, not wholesale.** Every rule this repo creates is named `[gop-managed:<key>] <displayName>` (`Domain/Moderation/ManagedName.ts`) — `automod:apply` only ever reads, updates or deletes rules carrying that marker; a rule made by hand in the Discord UI is invisible to it. A managed rule dropped from the file is reported as *orphaned*, never deleted, unless `--prune-orphaned` is also passed. The "commands only" channel-permission merge is bit-level, not overwrite-level: Discord's permission-overwrite PUT replaces the whole allow/deny pair with no partial-update endpoint, so `Domain/Moderation/ChannelPermissionPlan.ts` reads the existing `@everyone` overwrite first and flips only the two managed bits (`SendMessages` deny, `UseApplicationCommands` allow), leaving any other bit a moderator set by hand untouched. **(4) Dry-run makes zero Discord API calls, by design** — it cannot show a real diff against the live guild without a read call, so it validates the file and prints the fully-resolved desired state instead of pretending to be a diff it isn't; only `--apply` ever calls `AutoModClient`. Tested with a hand-rolled `InMemoryAutoModClient` (`Infrastructure/Community/InMemory/`), the same "doubles as the no-token DI fallback and the test fake" shape as `InMemoryGuildClient` — no mocking library, and no test can reach a real Discord API. Coverage: `tests/Integration/Domain/Moderation/{AutoModConfigParser,AutoModPlan,ChannelPermissionPlan,ManagedName}.test.ts`, `tests/Integration/Ui/Cli/ApplyAutoModConfig.test.ts`, `tests/Integration/Infrastructure/Community/Discord/DiscordAutoModClient.test.ts`. The checked-in `config/automod-rules.json` ships as a **starter file only** — one keyword rule with a placeholder word, `enabled: false`, plus an empty `commandsOnlyChannels` list — and is itself covered by a test asserting it parses and validates cleanly. **What Luis has to decide before this is ever run with `--apply` against the live guild**: (a) the actual pt-PT keyword/regex blocklist — nobody asked the community what it wants blocked, and inventing one isn't this agent's call; (b) which role(s) go in `exemptRoles` so moderators are never caught by their own rules; (c) which channels, if any, belong in `commandsOnlyChannels` — the old `specialchannels` table was empty in production, so there is no prior configuration to port forward, only a fresh decision. |
| **M9.2** | ✅ ~~`commandchannellink`~~ — **dropped.** Delete the `CommandChannelLink` model and its table. | [G17 / §6.2](../discord-bot-feature-gap.md) | **Done.** `CommandChannelLink` (table `commandchannellinks`) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`. No code referenced it. |
| **M9.3** | ✅ ~~**LFG**~~ — **dropped, will not be ported.** Delete the four LFG models (`LfgProfile`, `LfgGame`, `LfgEvent`, `LfgParticipation`) and their tables. | [G13, G14 / §5](../discord-bot-feature-gap.md) | **Done.** `LFGProfile`/`LFGGame`/`LFGEvent`/`LFGParticipation` (tables `lfgprofile`/`lfggames`/`lfgevents`/`lfgparticipations`) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`, along with their foreign keys. **Decided by Luis, 2026-08-19 and reaffirmed 2026-08-20: he is not interested in moving LFG** — see [Standing instructions](#standing-instructions-from-luis), where it is restated as closed to discussion. This closes the single largest item in the plan (~40% of the old bot's surface) and removes the one work item that needed its own spec document. All four tables were confirmed **empty** in production on 2026-08-20 before the drop, so there was no data to preserve and no migration risk. |
| **M9.4** | ✅ ~~**Stock alerts + Telegram bridge**~~ — **dropped.** Delete the `StockUrls` model and its table, and the `TELEGRAM_ACCESS_TOKEN` env var. | [G15 / §7.5](../discord-bot-feature-gap.md) | **Done.** `StockUrls` (table `stockurls`) removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`. `TELEGRAM_ACCESS_TOKEN` was already absent from `.env.example` and the compose files (cleared by an earlier M9.5/M1.6 pass) — verified, nothing left to remove. `stockurls` held **0 rows** in production — the feature had not been used once since the rewrite went live in April 2025. The legacy implementation also lost every pending alert on restart (bare `setTimeout`), so a port would have been a rewrite, not a port. |
| **M9.5** | ✅ **DONE (2026-08-20, #44)** — **Loki, not Sentry.** Delete `SENTRY_DSN`, `REDIS_DSN`, `TROPHY_WEBHOOK` and `TELEGRAM_ACCESS_TOKEN` from `.env.example` and the compose files. | [G22 / §7.6](../discord-bot-feature-gap.md), [#8](../known-issues.md) | **Verified, not re-done — the vars were already gone.** `grep -rn` for all four names across the whole repo (including `infrastructure/`) before touching anything: the only hits outside historical `docs/` prose were in `old-discord-bot/` itself (its own `.env.dist` and source), which M9.6 deletes in this same PR. `discord-bot/.env.example`, both `docker-compose*.yml` files and `infrastructure/game-on-portugal.yaml` were already clean and already carry `LOKI_HOST`/`LOKI_AUTH` — an earlier pass (referenced by M9.4's note) did this work before the item was marked done. What was actually stale was **`AGENT.md`/`CLAUDE.md`'s own trap list**, which still claimed `.env.example` "advertises" the four dead vars and "omits" `LOKI_HOST`/`LOKI_AUTH` — both false. Removed that bullet. Also marked `known-issues.md` #8 fixed with the verification evidence, so the next agent doesn't re-open it. Loki is already half-wired and there is an existing Grafana Cloud stack to ship to; Sentry would be a second vendor for the same signal. Do **not** enable `LOKI_HOST` until M0.7 lands — the entrypoint prints the database password on the first line, and enabling Loki first ships it to Grafana Cloud. The `job: 'tedcrypto-campaign'` label bug (M3.5) is unrelated and untouched. |
| **M9.6** | ✅ **DONE (2026-08-20, #44)** — **Retire `old-discord-bot/`** — move to `reference/` once M7 has taken what it needs from the scraper, then delete. Drop the seven now-dead Prisma models in one migration (4 LFG + `StockUrls` + `CommandChannelLink` + `SpecialChannel`). | revival plan item 25 | **Schema half landed 2026-08-20** (see prior note, unchanged): all seven models removed from `schema.prisma` and dropped in migration `20260820102655_drop_dead_models`, guarded by a pre-drop row-count check. **Directory half done in this PR, deleted outright rather than moved to `reference/`** — git already preserves every version (`git log -- old-discord-bot` after the merge), so a `reference/` copy would only have been a second, staler copy of the same information, with no upside. Before deleting, confirmed the port had taken everything worth keeping, not just the two headline pieces (M7.1's scraper, M7.2's points ladder): re-read `old-discord-bot/src` end to end against `discord-bot/src` and the feature-gap doc — the only other things it had were LFG, stock alerts/Telegram, `commandChannelLink`/`prefix`/`channel` and `market wanted`, all of which are **formally dropped** (M9.2/M9.3/M9.4) or tracked as open work items elsewhere (`market wanted` isn't in this milestone), not silently lost. Then `grep -rn old-discord-bot` across the whole repo to find and fix every reference that would break: `.github/labeler.yml`'s `Legacy` label dropped the `old-discord-bot/**` glob (kept `webpage/**`), `.github/workflows/security.yml`'s Trivy `skip-dirs` dropped `old-discord-bot` (kept `webpage`). Everything else that mentioned the path was prose in `docs/` (no actual markdown links pointed into the directory — checked with `grep -n '\](.*old-discord-bot'`, zero hits), so nothing needed re-pointing to a permalink; updated the few docs that asserted the directory's *current* existence in present tense (`README.md`'s 60-second version, `state-of-the-project.md`'s predecessor section, `revival-plan.md` item 25) and left the rest (the feature-gap document itself, the bot-audit doc) as-is since they already read as history of a system that no longer runs, which is true with or without the directory checked out. |
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

> **Editing this table from a branch?** Change only *your* milestone's row,
> then **recompute the Total by adding the Done column up** — never by
> incrementing whatever number you found there. Several branches land in
> parallel most days, each one bumps the Total, and git merges both bumps into
> a single wrong number. It has drifted three times already (58 → 59 → 60 → 61
> against a real 65). If you hit a merge conflict here, it will be these two
> lines: keep both milestone rows, and recompute.

| Milestone | Items | Done | Status |
| --------- | ----- | ---- | ------ |
| M0 Stop the bleeding | 9 | 9 | **complete** — #11 #12 #13 #14 #15. All five live defects verified fixed *in production*, not just in CI |
| M1 Restore the signal | 10 | 10 | **complete** — #9 #12 #18 #21, then #27 (M1.2, the `tests/Helper/FakeInteraction.ts` harness), #28 (M1.3 env validation, M1.4 loud registration), #34 (M1.10 `ManageMessages` admin check) |
| M2 Infrastructure cutover | 6 | 5 | **cut over 2026-08-19** — production is HTZ1, Portainer stack 46. M2.5 (decommission TedRelayer) due 2026-09-02 |
| M3 Dependencies & container | 8 | 7 | #11 #20. `bun audit` **26 advisories → 0** and the gate is blocking again. Remaining: **M3.6 Prisma 6→7**, deliberately left alone as its own PR |
| M4 Discord API modernisation | 10 | 10 | **complete** — #27 (M4.1 typed interaction layer, M4.2 deferReply, M4.10 embed limits), #28 (M4.4 lifecycle, M4.5 REST-only guild client, M4.6 cache/sweepers, M4.9 attachment ingest), #34 (M4.3 registration), #42 (M4.7 component routing, M4.8 autocomplete). **M5.5/M5.6/M6.5 and M7.6 are unblocked** |
| M5 Marketplace overhaul | 11 | 6 | #29 (M5.3 lifecycle columns + migration), #35 (M5.1 route to `#anuncios`, M5.2 delete removes the message and soft-deletes the row), #49 (M5.4 pt-PT copy pass, M5.5 listing embed + buttons — first `ComponentHandler`, M5.6 shared sold/bump/edit handlers + edit modal). Remaining: **M5.7 `wanted`**, **M5.8 `list` pagination**, **M5.9 `search`**, **M5.10 limits + admin override on delete**, **M5.11 images to MinIO** |
| M6 Jobs, lifecycle & media | 9 | 9 | **complete** — #19 (M6.7), #30 (M6.0 `MediaStorage` + S3/MinIO), #31 (M6.4 winner hardening), #32 (M6.1 runner + M6.8 reporting), #37 (M6.2 fix-at-source, M6.3 relink recovery), #40 (M6.5 `ads:lifecycle`, M6.6 `ads:reconcile`). Every scheduled job the plan asked for now exists and is registered against a working runner |
| M7 Trophies | 8 | 8 | **complete** — #24 (M7.1 PSNProfiles source, M7.2 points ladder), #39 (M7.3 `trophies:sync` with scheduling opt-in via `TROPHIES_SYNC_ENABLED` and a moderation safety valve, M7.4 live rank on `/trophy check`, M7.5 both `/trophy create` URL shapes, M7.7 the `trophies:fix-old` backfill), #46 (M7.8 announcements through the bot, flood-guarded and off by default), #50 (M7.6 custom rank emojis with a unicode fallback, and pagination buttons on M4.7's component table) |
| M8 Community portal | 15 | 8 | **[#48](https://github.com/GameOnPortugal/monorepo/pull/48)** — M8.2 (release-please + `infrastructure/game-on-portugal.yaml` + CI wiring), M8.3 (`portal/api` scaffold, read-only over the bot's schema, 9 tests), M8.5 (`portal/web` scaffold: tokens, routing, one representative page). **[#56](https://github.com/GameOnPortugal/monorepo/pull/56)** — M8.4 (shared normalisation module, portal-side only — bot-side adoption recorded as follow-up in that row), M8.6 (Home: live stats via a new `/api/stats`, real strips into the pages below), M8.7 (Marketplace grid/filters/detail), M8.8 (Screenshots gallery + Lightbox, with viewport-gated lazy loading standing in for real thumbnails, and an honest Hall of Fame placeholder — winner history is never persisted anywhere in the schema, see that row), M8.9 (Trophies leaderboard — the plan's "data frozen" notice is correctly *not* present, since M7 landed the same night). M8.1's design tokens landed as part of M8.5; the brand art itself has an **open, unmerged PR** in flight from a separate agent as of this update, so that row is left untouched per this agent's own scope instructions. Remaining, untouched: **M8.10–M8.15** (Discord OAuth + admin shell, admin CRUD/audit log, admin jobs page, SEO/OG/sitemap, deploy+CI docs, the plan-04-phase-4 domain cutover). |
| M9 Feature gap & dead weight | 7 | 5 | #33 — M9.2/M9.3/M9.4 **done**, seven dead models and their tables dropped (migration `20260820102655_drop_dead_models`, guarded and verified against a production copy). M9.1 redesigned onto AutoMod. #44 — **M9.5 verified** (env vars were already clean; fixed the stale trap note in `AGENT.md` instead), **M9.6 done** (`old-discord-bot/` deleted, all references fixed). Remaining: **M9.7** (privacy flag) |
| **Total** | **93** | **77** | |

### What landed on 2026-08-20 (second session)
Fourteen more PRs (#23–#37), taking the queue from 41/92 to **54/93** — the
extra item is **M6.0**, a `MediaStorage` port that was not in the original plan
and which M5.11/M6.2/M6.3 all turned out to be blocked on.
Milestones **M1 and M4** are the headline: M1 is now **complete**, and M4 went
from 0/10 to 8/10, which is what unblocks M5, M6 and M9.
Three defects were found by *verifying against production* rather than by
reading code, and none of them were in the plan:
- **`findByWeek` used a Sunday→Saturday window**, not the old bot's
  Monday→Sunday. The weekly winner had been computing the wrong week — invisible
  because the job had never once run.
- **The `adType` history was recorded backwards.** `sell` is the *old* bot;
  `sale` is what the *current* code writes — and those 28 rows are exactly the
  28 with a broken `message_id`. A migration alone would not have held, because
  the live write path was still emitting `sale`.
- **The relink design was wrong.** M6.3 assumed one population needing a full
  channel scan. There are two: 614 old-bot rows whose `message_id` is
  *correct* (probed 25/25 against the live API) and recoverable straight from
  `embeds[0].image.url`, and 10 rewrite-era rows that do need the
  `ID: #<uuid>` scan. The plan's approach would have walked history to 2021 to
  recover data that was directly addressable.
And one bug found *in production, by the observability that shipped with it*:
the first scheduled job run in sixteen months failed with
`invalid date argument "undefined"` — an integration bug between #31 and #32,
each correct in isolation, whose seam neither side's tests covered (#36).
> **The lesson worth keeping**: every one of these came from querying the live
> database or the live Discord API, not from reading the repo. Cross-cutting
> rule 8 says "verify in production, not in the repo" — it earned its place
> five times in one day.
### What landed with M7.3/M7.4/M7.5/M7.7
Wires M7.1/M7.2's `TrophySource`/`TrophyPoints` (#24) into a running job:
`trophies:sync` (catch-up mode, auto-moderation with a deferred-write safety
valve, opt-in scheduling via `TROPHIES_SYNC_ENABLED`), live rank on
`/trophy check`, both `/trophy create` URL shapes, and the
`trophies:fix-old` backfill. Full design notes are in the M7.3–M7.5/M7.7 rows
above and the PR description.

### What landed with M7.8 (#46)

`trophies:sync` now announces each newly-credited trophy through
`GuildClient` — no webhook, no separate process — gated behind its own
opt-in flag (`TROPHIES_ANNOUNCE_ENABLED`, default off, same reasoning as
`TROPHIES_SYNC_ENABLED`) plus a per-profile batching threshold and a
per-run message cap so a large backlog (first sync, or a profile
reconnecting after months away) can't flood the channel. Full design notes
are in the M7.8 row above and `TrophiesSyncJob.ts`'s "Announcements, and
their flood guard" doc comment. Remaining in M7: **M7.6** (rank
presentation parity, needs M4.7 component routing) — the only item left in
this milestone.
above and the PR description. **M7.6** (rank presentation parity — guild
emojis, `trophies` component-handler pagination) landed separately once M4.7
did; see its own row. Remaining in M7: **M7.8** (announcements).

### What landed with M8.2/M8.3/M8.5 (portal scaffold)

The first portal code in the repo: `portal/api` (Bun + Hono, read-only over
the bot's schema) and `portal/web` (Vite + React + Tailwind, dark-first
tokens, one representative page), plus the release-please/CI/deploy wiring
that has to land in the same PR that creates the directories (release-please
errors on a package path that doesn't exist yet). Full reasoning is in the
M8.1/M8.2/M8.3/M8.5 rows above; the two things worth surfacing here:

- **The schema-sharing mechanism turned out to be free.** Prisma's
  un-overridden client output path resolves relative to the schema file, not
  the invoking package — so pointing `portal/api` at
  `discord-bot/prisma/schema.prisma` with `--schema` writes the generated
  client straight into `discord-bot/node_modules/@prisma/client`, the same
  artifact the bot uses. No shared workspace package, no copy, no drift. The
  only cost is that the two packages' `prisma` versions have to be pinned
  exactly equal.
- **Uncommenting the Portainer services for M8.2 would have broken the next
  deploy** if left there: Portainer fails an entire stack rollout — bot
  included — if any one service's image can't be pulled, and nothing built
  `portal-api`/`portal-web` images yet. `deploy.yml` gained build-and-push
  jobs for both, mirroring the existing `build-bot` job, closing that gap in
  the same PR rather than leaving a landmine for whoever merges next.

Not done: M8.1's brand art (guild icon/banner → SVG — needs binary asset
fetch/tracing this agent's tool loadout couldn't do), M8.4 (shared
normalisation module), and M8.6-M8.15 (the actual pages, OAuth admin, jobs
UI, SEO, and the plan 04 phase-4 domain cutover).

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
