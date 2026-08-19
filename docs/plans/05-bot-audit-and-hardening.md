# Discord Bot — API Modernisation, Capability Lift & Security Hardening

**Status:** Planned, not started. Written 2026-08-19.
**Repo:** `GameOnPortugal/monorepo` → `discord-bot/` (the TS rewrite). Legacy reference: `old-discord-bot/` (discord.js v12, JS, Sequelize).
> Moved into the repo on 2026-08-19 from `~/claude-plans/2026-08-19-discord-bot-upgrade.md`.
> Sequencing is now owned by [`GLOBAL-PLAN.md`](GLOBAL-PLAN.md); read this file for the **findings**.

> **This is the umbrella plan.** Two focused companion plans drill into the areas Luis flagged:
> - **[Dependency upgrades](07-dependency-upgrades.md)** — full locked inventory, version gaps, the undici pin, Prisma 6→7, dependency hygiene defects.
> - **[Modern Discord practices](06-discord-api-modernisation.md)** — deprecated API usage, deferred responses, components/autocomplete/modals, registration metadata, client config.
>
> Sections C (API modernisation) and E0 (dependency currency) below are summaries; the companion plans supersede them in detail.

---

## TL;DR

`discord-bot/` is a clean hexagonal/CQRS TypeScript+Bun rewrite on discord.js **14.18.0** (Discord API **v10**, which is still the current gateway/REST version — so this is *not* an API-version migration). The real work is in three buckets:

1. **Security & robustness** — the bot posts unsanitised user input as message content (`@everyone` injection is live), has no permission gating, no channel scoping, no rate limiting, and leaks internal error strings to users.
2. **Interaction-API modernisation** — no `deferReply()` anywhere (3-second timeout risk on every DB-heavy command), deprecated `ephemeral:`/`fetchReply:` options, `reply(string, options)` misuse that silently makes error messages **public**, global-only command registration, and zero use of components (buttons/modals/select menus/autocomplete).
3. **Capability gaps vs. the old bot** — `/trophy rank` is dead in the water because the **PSN crawler was never ported**, so the `trophies` table is never populated. LFG, stock alerts, `wanted` ads, and command-channel linking all exist in `old-discord-bot/` and are absent here.

Recommended sequencing: **Phase 0 (bugs+security, ship fast) → Phase 1 (API modernisation) → Phase 2 (capability lift) → Phase 3 (infra/CI)**.

---

## Current state

| Area | Detail |
|---|---|
| Runtime | Bun 1.2.10 (alpine image), TypeScript ESM, `strict` + `noUncheckedIndexedAccess` |
| Library | `discord.js@14.18.0` → `discord-api-types@0.37.120`, Discord API v10 |
| Architecture | Domain / Application (CQRS: Command+Handler) / Infrastructure / Ui, InversifyJS 7 container |
| Persistence | Prisma 6 → MariaDB 11.7 |
| Logging | Custom `LoggerManager` → Console + Loki (winston) |
| Commands | `/ping`, `/screenshot create\|list\|delete`, `/trophy create\|check\|rank`, `/marketplace sell\|list\|delete` |
| Cron | `scheduler/` (chadburn) runs `bun run:command week-screenshot-winner` Sun 23:50 |
| Deploy | GH Actions → Docker Hub `joshlopes/game-on-portugal-bot` → CapRover |
| Tests | Bun test, integration-only (Application handlers). No Discord-layer tests. Static analysis job is **commented out** in `.github/workflows/bot.yaml` |

---

## Findings

### A. Security

**A1 — Mention injection / mass-ping (HIGH).** `SellSubcommand.ts:57-70` builds `replyContent` by string-concatenating user-supplied `name`, `price`, `zone`, `warranty`, `description` and posts it as message **content**. Nothing sets `allowedMentions`. A member can create a listing named `@everyone` and make the bot ping the server. Same exposure in `ListAdsSubcommand.ts` (embed fields), `CreateScreenshotSubcommand.ts:53-58`.
*Fix:* set `allowedMentions: { parse: [] }` globally on the `Client` constructor **and** per-reply; prefer embeds over raw content; escape with `escapeMarkdown()` where content is unavoidable.

**A2 — No authorisation model at all.** Every command is invokable by every member in every channel, including DMs. `old-discord-bot` had `commandChannelLink` (per-channel command allowlist) and LFG ban state; neither survived. No `setDefaultMemberPermissions()`, no `setContexts()`, no role checks.
*Fix:* add `setDefaultMemberPermissions` to admin-ish commands, `setContexts([Guild])` to guild-only ones, and reintroduce a channel-scoping table.

**A3 — Internal error leakage.** `DeleteAdSubcommand.ts:59` replies `Error deleting ad: ${error.message}` — raw exception text (potentially Prisma/DB detail) to the user.
*Fix:* generic user message + correlation id; full error to Loki only.

**A4 — Unbounded attachment download.** `CreateScreenshotHandler.generateMd5FromImageUrl()` fetches the attachment URL into memory with no size cap, no content-type re-check server-side, and no timeout beyond axios defaults. Discord attachments can be very large.
*Fix:* cap by `image.size` before fetching, enforce a max-bytes stream limit and an explicit timeout, and validate against Discord's CDN host allowlist.

**A5 — Second gateway connection with the same token.** `DiscordGuildClient` lazily constructs a *whole second* `Client({intents: []})` and `login()`s it (`inversify.config.ts` binds it eagerly with `process.env.DISCORD_TOKEN ?? ''`). It is never `destroy()`ed, so the CLI process holds an open gateway session.
*Fix:* replace with a REST-only `@discordjs/rest` client; no gateway session needed for `channels.fetch`/`messages.fetch`/`send`.

**A6 — Empty-string token fallback.** `?? ''` in three places silently produces an invalid client instead of failing fast.
*Fix:* validate env at boot with a schema (zod/typebox) and exit non-zero on missing required vars.

**A7 — No supply-chain or static-analysis gate.** No Dependabot/Renovate, no CodeQL, no `bun audit`, and the static-analysis CI job is commented out — so `tsc --noEmit` never runs. (There is at least one latent type error today: `ads[position].id` in `DeleteAdSubcommand.ts:33` under `noUncheckedIndexedAccess`.)

**A8 — Container runs as root**, ships `mariadb-client` in the runtime layer, and dev compose bind-mounts the whole repo `rw`. Dockerfile also has a `COPY ../ .` that only works by accident of build context.

**A9 — Disabled TLS certificate validation (CodeQL `js/disabling-certificate-validation`, HIGH).** `AxiosHttpClient.ts` built its `https.Agent` with `rejectUnauthorized: false` and `checkServerIdentity: () => undefined`, accepting any certificate for any host — the second option defeats validation even where a valid-but-wrong-host certificate is presented. **Live, not latent**: the injection chain is `TYPES.HttpClient` → `RetryAxiosHttpClient` → `AxiosHttpClient`. `RetryAxiosHttpClient` takes `AxiosHttpClient` as a constructor dependency (`@inject(AxiosHttpClient) private readonly axios: AxiosHttpClient`) and delegates every call to it — it defines no `https.Agent` of its own, which is why grepping for `rejectUnauthorized` alone under-reports the blast radius. `CreateScreenshotHandler` injects `TYPES.HttpClient` and calls it in `generateMd5FromImageUrl()` to download the Discord attachment being screenshotted, a path that has been running in production since April 2025. Practical effect: exploiting it requires a network position between the bot and the image host (e.g. Discord's CDN) — this is "no transport protection on a routinely-used path," not "the bot has been leaking data." It compounds with **A4 / M4.9** (unbounded attachment download, no size cap, no timeout, no CDN host allowlist): an unvalidated TLS connection to an unrestricted host is worse than either gap alone. Fixed in the M1.8 dead-ends PR (`fix/tls-validation-and-dead-ends`, [#12](https://github.com/GameOnPortugal/monorepo/pull/12)).

### B. Correctness bugs found while reading

**B1 — Rankings are wrong (HIGH).** `OrmTrophyRepository.ts:104,137,170` apply `take: limit` in the Prisma query *before* points are computed and sorted in JS. "Top 10" is therefore *an arbitrary 10 profiles, sorted among themselves* — not the top 10. Affects all three `/trophy rank` modes and `findUserPosition` (which requests 1000 then index-searches).
*Fix:* aggregate + order in SQL (`groupBy`/raw aggregate on points) and paginate properly.

**B2 — Ephemeral flag silently dropped.** `reply(string, {flags})` is not a valid discord.js v14 signature — the second argument is ignored. `ScreenshotSlashCommand.ts:106`, `CreateScreenshotSubcommand.ts:28,34`. Those "errors" are posted **publicly**.

**B3 — Double-reply crashes.** `SellSubcommand` `catch` calls `interaction.reply()` even when the try block already replied (`InteractionAlreadyReplied`). Same shape in `ScreenshotSlashCommand.handle()` and `TrophySlashCommand.handle()` — the outer catch replies after a subcommand may already have. Only `DiscordBot.ts:41-52` gets this right (`replied || deferred` check).

**B4 — `DeleteScreenshotSubcommand` is missing `@injectable()`** (`src/.../Screenshot/DeleteScreenshotSubcommand.ts:604`-ish — the class declaration has the decorator omitted while its siblings have it). Bound via `.toSelf()`. Needs verifying against Inversify 7 resolution at runtime; if it throws, `/screenshot` is broken at container build.

**B5 — `@multiInject(TYPES.MentionHandler)`** in `BotExecutor` has **zero bindings** in `inversify.config.ts`. Inversify throws on empty multiInject unless marked optional. Verify; either bind an empty array or mark `@optional()`.

**B6 — Embed limits unguarded.** `ListAdsSubcommand` adds one field per ad with no cap (Discord max 25 fields, 1024 chars/field, 6000 chars/embed). A user with 26 listings breaks the command. `ListScreenshotSubcommand` does cap at 10 — inconsistent.

**B7 — Duplicate write on sell.** `SellSubcommand` calls `CreateAd` twice (once to get an id, once to attach `message_id`). Works only because the repo `save` upserts; it should be an explicit `AttachMessageToAd` command.

**B8 — Screenshot image URLs rot.** Discord CDN URLs have been signed/expiring since late 2023. `screenshots.image` stores the raw URL, so the archive dies after ~24h. Needs re-hosting (S3/R2) or storing `message_id` + refetching.

**B9 — `RankSubcommand`** indexes `data.ranks[0..2]` unchecked, and `lifetime` position is hardcoded to equal `creation` (`OrmTrophyRepository.findUserPosition`, comment says "for now").

**B10 — `DeleteAdSubcommand.ts:33`** `ads[position].id` — possibly-undefined access (see A7).

### C. Discord API / interaction modernisation

**C1 — No `deferReply()` anywhere.** Every handler must answer within 3 s. `/trophy rank` pulls up to 1000 profiles with all their trophies; `/screenshot create` downloads and MD5s an attachment *inside* the interaction window. These will intermittently fail with "The application did not respond".
*Fix:* `deferReply({ flags: MessageFlags.Ephemeral })` first thing in every non-trivial handler, then `editReply()`.

**C2 — Deprecated option shapes.** `ephemeral: true` (7 sites in Marketplace) → `flags: MessageFlags.Ephemeral`. `fetchReply: true` (2 sites) → `withResponse: true` / `interaction.fetchReply()`.

**C3 — Global-only command registration.** `Routes.applicationCommands(clientId)` — up to 1 h propagation, and no dev/guild-scoped path. Errors are swallowed to `console.error` (bypassing the Logger), so a failed sync starts the bot with stale commands silently.
*Fix:* guild-scoped registration behind `DISCORD_GUILD_ID` for dev, global for prod; fail loudly; skip the PUT when the command set hash is unchanged.

**C4 — No modern component surface.** Zero buttons, select menus, modals, or autocomplete. High-value applications:
  - `/marketplace sell` → **modal** for the long free-text fields (better UX than 7 slash options) + "Mark as sold" / "Bump" buttons on the listing.
  - `/marketplace delete` and `/screenshot delete` → **autocomplete** on the id option (they currently ask users to paste a UUID, with a positional-index hack bolted on in `DeleteAdSubcommand`).
  - `/trophy rank` → pagination buttons instead of `limit` capped at 10.
  - Screenshot contest → voting via buttons instead of scraping reaction counts.
**C5 — Missing modern registration metadata:** `setContexts()` / `setIntegrationTypes()` (user-installable apps), `setNSFW()`, localisations (`setNameLocalizations`) — the server is Portuguese and every string is English today.
**C6 — No `Events.Error`/`ShardError` handlers, no `unhandledRejection`/`uncaughtException` handlers, no SIGTERM graceful shutdown** (client not destroyed, Prisma not disconnected). Container restarts leave sessions dangling.
**C7 — Interaction types unhandled:** only `isChatInputCommand()`. No context-menu commands, no autocomplete routing, no component/modal routing. `SlashCommandContext.interaction` is typed `any`, which is why none of the above is type-checked.

### D. Capability gaps vs `old-discord-bot/`

| Capability | Old bot | New bot |
|---|---|---|
| PSN trophy crawler (`service/trophy/psnCrawlService.js`, 123 LOC + `trophyProfileManager.js`, 284 LOC) | ✅ | ❌ **missing — `/trophy rank` returns nothing, ever** |
| LFG (create/cancel/rank/report/commend/ban/unban — 12 subcommands) | ✅ | ❌ (schema tables exist, unused) |
| Marketplace `wanted` ads | ✅ | ❌ (`adType` is hardcoded `'sale'`) |
| "Has been sold" reaper script | ✅ | ❌ |
| Stock URL alerts | ✅ | ❌ |
| Special channels / command-channel linking | ✅ | ❌ (tables exist, unused) |
| Message validator (moderation: regex + commands-only channels) | ✅ | ❌ |
| Telegram + Sentry notification | ✅ | ❌ (`SENTRY_DSN`/`TELEGRAM_ACCESS_TOKEN` still in `.env.example`, unused) |

The scheduler config has `parse-psn-profiles`, `update-lfg-points` and `has-been-sold` jobs **commented out** — waiting on these ports.

### E. Infra / CI

**E0 — Dependency currency.** `prisma`/`@prisma/client` are pinned at `^6.6.0`; the current published release is **7.8.0** (verified 2026-08-19 against the npm registry) — a full major behind, with the Prisma 7 client-generation and query-engine changes to absorb. `discord.js@14.18.0`, `inversify@7.5.0`, `axios@^1.8.4` and `dotenv@^16.5.0` could not be checked (the sandbox's npm registry access failed with TLS errors); **re-check all of these at implementation time**. Treat the Prisma 6→7 upgrade as its own PR with the integration tests as the gate — it is the riskiest single dependency move here.

- Static-analysis job commented out in `bot.yaml`; no `tsc --noEmit`, no linter config in the repo at all.
- No healthcheck for the bot container (it `EXPOSE 3000` and sets `PORT=3000` but nothing listens).
- No Dependabot/Renovate/CodeQL.
- `entrypoint.sh` parses `DATABASE_URL` with `cut`/`sed` and **echoes the DB password** to stdout on every connection attempt → password lands in container logs.
- CI copies `.env.test` over `.env`; fine, but there is no secrets-scanning gate.

---

## Proposed plan

### Phase 0 — Correctness + security hotfix (1 PR, small, ship first)
1. `allowedMentions: { parse: [] }` on the `Client` and on every reply that echoes user input (A1).
2. Fix `reply(string, {flags})` → options object at 3 sites (B2).
3. `ephemeral: true` → `flags: MessageFlags.Ephemeral` (C2).
4. Add `replied || deferred` guards to all catch-blocks; extract a `safeReply(interaction, payload)` helper (B3).
5. Stop leaking `error.message` to users (A3).
6. Add `@injectable()` to `DeleteScreenshotSubcommand`; make `MentionHandler` multiInject optional (B4, B5).
7. Fix `ads[position]` undefined access (B10).
8. Re-enable the static-analysis CI job and add `bun run typecheck` (`tsc --noEmit`) — this is what will keep 6/7 from recurring.

### Phase 1 — Interaction API modernisation (2–3 PRs)
1. **Type the Discord layer.** Replace `interaction: any` in `SlashCommandContext` with `ChatInputCommandInteraction`; introduce discriminated `InteractionContext` covering chat-input / autocomplete / component / modal. This is the enabler for everything below.
2. **Defer everything non-trivial** (C1) — `deferReply` + `editReply`, with the ephemeral decision moved into each handler.
3. **Registration overhaul** (C3) — guild-scoped in dev via `DISCORD_GUILD_ID`, global in prod, hash-diffed, errors through `Logger`, fail-fast on sync failure. Add `setDefaultMemberPermissions`/`setContexts` (A2).
4. **Lifecycle hardening** (C6) — `Events.Error`, `process.on('unhandledRejection'|'uncaughtException'|'SIGTERM')`, `client.destroy()` + `prisma.$disconnect()` on shutdown. Replace `DiscordGuildClient`'s second gateway `Client` with `@discordjs/rest` (A5).
5. **Env validation at boot** (A6).
6. **Components** (C4) — start with autocomplete on the two delete commands (removes the UUID-paste UX and the positional-index hack), then the sell modal, then rank pagination.

### Phase 2 — Capability lift (largest chunk)
1. **Port the PSN crawler** — this is the single highest-value item; without it `/trophy` is decorative. New `Infrastructure/Trophy/PsnProfilesCrawler` behind a `TrophySource` domain port, driven by a new console command (`parse-psn-profiles`) so `scheduler/config.ini` can re-enable its job. Respect robots/rate-limits; cache; backoff. Fix B1 (ranking SQL) as part of this.
2. **Marketplace completeness** — `wanted` ads (`adType` already in the schema), `has-been-sold` reaper as a console command, "Mark as sold"/"Bump" buttons, embed-limit-safe pagination (B6), `AttachMessageToAd` command replacing the double-write (B7).
3. **Screenshot durability** (B8) — re-host images to object storage on submit, or store `message_id` and refetch; decide before the archive matters.
4. **LFG** — the biggest single feature (12 subcommands + 4 Prisma models already present). Worth its own spec; probably a follow-up plan file rather than part of this one.
5. **Localisation** (C5) — pt-PT command names/descriptions and reply strings.

### Phase 3 — Infra / CI
1. Dependabot or Renovate + CodeQL; `bun audit` in CI.
1b. Prisma 6 → 7 upgrade as a standalone PR, gated on the existing integration suite (E0).
2. Non-root container user, drop `mariadb-client` from the runtime layer, fix `COPY ../ .` (A8).
3. Stop echoing the DB password in `entrypoint.sh` (E).
4. Add a `/health` HTTP endpoint (port 3000 is already exposed) + compose healthcheck, so CapRover can actually tell if the bot is alive.
5. Discord-layer unit tests (currently zero) — the `InMemoryClient` seam already exists to build on.

---

## Decisions & rationale

- **Not migrating to a newer Discord API version.** discord.js 14.18 already speaks API v10, which is current. The gain is in *unused* v10 features (components, autocomplete, contexts, integration types), not a version bump. A discord.js patch bump to the latest 14.x is still worth doing for security fixes — **verify the exact latest 14.x at implementation time** (npm was unreachable from the sandbox when this plan was written, so no version number is asserted here).
- **Phase 0 before Phase 1** because A1 (mention injection) and B2 (public "ephemeral" errors) are live user-facing exposure and each is a few lines.
- **Typing the Discord layer early (Phase 1.1)** because `interaction: any` is why B2/B3/B10 all got through review; fixing it converts a class of runtime bugs into compile errors — but only once `tsc --noEmit` runs in CI (Phase 0.8).
- **PSN crawler ahead of LFG** — `/trophy rank` is already shipped and visibly broken (it returns empty rankings), whereas LFG is simply absent. Fixing a broken promise beats adding a new one.

## Open questions for Luis

1. Is LFG actually wanted back, or was dropping it deliberate? It's ~40% of the old bot's surface.
2. Screenshot archive: is long-term image retention a requirement (→ object storage), or is the weekly winner announcement enough (→ ignore B8)?
3. Portuguese localisation — worth doing, or is the server bilingual enough that English is fine?
4. Sentry: `.env.example` still advertises `SENTRY_DSN` but nothing reads it. Reinstate, or drop the var and rely on Loki?

## Operational reference

- Bot source: `discord-bot/src/` (`Domain` / `Application` / `Infrastructure` / `Ui`)
- Legacy reference implementation: `old-discord-bot/src/` (discord.js v12)
- CI: `.github/workflows/bot.yaml` → `shared.tests.yaml` → `shared.build-image.yaml` → `shared.deploy.yaml`
- Image: Docker Hub `joshlopes/game-on-portugal-bot`; deploy target CapRover (`CAPROVER_DISCORD_BOT_APP`)
- Cron: `scheduler/config.ini` (chadburn), container `game-on-portugal-app-placeholder`
- Console commands: `bun run:command <name>` → `discord-bot/bin/console.ts`
