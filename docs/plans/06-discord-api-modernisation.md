# Discord Bot — Modern Discord API & discord.js Practices

**Status:** Planned, not started. Written 2026-08-19.
**Scope:** `discord-bot/` in `GameOnPortugal/monorepo` — currently `discord.js@14.18.0`, Discord API **v10**.
**Companion plans:** [dependency upgrades](07-dependency-upgrades.md) · [bot audit](05-bot-audit-and-hardening.md)

> Moved into the repo on 2026-08-19 from `~/claude-plans/`. Sequencing is owned by
> [`GLOBAL-PLAN.md`](GLOBAL-PLAN.md); read this file for the **detail**.

---

## TL;DR

The bot is on the **current API version** (v10) — there is no version migration to do. What's missing is everything v10 gained *after* this code was written. The bot uses exactly one interaction type (`isChatInputCommand`), replies inline with plain strings and embeds, registers commands globally, and types `interaction` as `any`. It uses **none** of: deferred responses, components (buttons/select menus/modals), autocomplete, context menus, install contexts, permission gating, or localisation.

The three changes with the best value-to-effort ratio, in order:
1. **`deferReply()` everywhere** — the bot currently races Discord's 3-second interaction deadline on every DB-backed command, and loses sometimes.
2. **Type the interaction layer** — `interaction: any` is the root cause of the deprecation bugs below; fixing it converts them into compile errors.
3. **Autocomplete on the two delete commands** — removes the "paste a UUID" UX and the positional-index hack bolted onto it.

---

## ⚠️ Verification caveat

My knowledge runs to **May 2026** and the npm registry was unreachable from this environment, so I could not confirm the current discord.js release or read recent changelogs. Everything below marked **[verify]** should be checked against the discord.js guide and Discord changelog before implementation. Everything about *this repo's current state* is read directly from the code and is fact.

---

## 1. Deprecated / wrong API usage in the code today

These are concrete, located, and mostly one-line fixes. Newer 14.x releases warn or error on several of them, so they must be cleared as part of the discord.js bump.

| # | Issue | Sites |
|---|---|---|
| P1 | **`reply(string, { flags })` is not a valid signature.** The second argument is silently ignored, so these "ephemeral" errors are posted **publicly**. | `ScreenshotSlashCommand.ts:106`, `CreateScreenshotSubcommand.ts:28,34` |
| P2 | **`ephemeral: true` is deprecated** in favour of `flags: MessageFlags.Ephemeral`. | `DeleteAdSubcommand.ts:29,38,46,51,56,59`, `MarketplaceSlashCommand.ts:119` |
| P3 | **`fetchReply: true` is deprecated** in favour of `withResponse: true` (which returns an `InteractionCallbackResponse`, *not* a `Message` — the call sites use `.id` off the result and will need adjusting). | `SellSubcommand.ts:81`, `CreateScreenshotSubcommand.ts:59` |
| P4 | **No `replied`/`deferred` guard in catch blocks** → `InteractionAlreadyReplied` crashes. Only `DiscordBot.ts:41-52` does it correctly. | `SellSubcommand`, `ScreenshotSlashCommand.handle`, `TrophySlashCommand.handle` |
| P5 | **`interaction` is typed `any`** throughout (`SlashCommandContext.ts:5`), which is *why* P1–P4 were never caught. | all handlers |

**Fix pattern** — one shared helper kills P1, P2 and P4 at once:

```ts
// Domain/Bot/respond.ts
export async function respond(
  interaction: ChatInputCommandInteraction,
  payload: InteractionReplyOptions,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
}
```

---

## 2. Interaction lifecycle — the 3-second deadline

**There is not a single `deferReply()` call in the codebase.** Discord requires an initial response within **3 seconds**, after which the interaction token is dead and the user sees *"The application did not respond."*

Current worst offenders:
- `/screenshot create` — downloads the attachment over HTTP and MD5s it (`CreateScreenshotHandler.generateMd5FromImageUrl`) **inside** the 3s window, then does a DB lookup and write.
- `/trophy rank` — `findUserPosition` calls `getTopMonthlyHunters(1000)` *and* `getTopSinceCreationHunters(1000)`, each loading up to 1000 profiles **with all their trophies** and sorting in JS.
- `/marketplace delete` by position — issues a `ListUserAds` query before the delete.

**Pattern to adopt:** defer first, then edit.

```ts
await interaction.deferReply({ flags: MessageFlags.Ephemeral });
const result = await this.commandHandlerManager.handle(command);
await interaction.editReply({ embeds: [buildEmbed(result)] });
```

Deferring extends the window to **15 minutes**. Note the ephemeral decision moves to `deferReply` — it cannot be changed at `editReply` time, so each handler must decide up front.

---

## 3. Components — the biggest capability gap

The bot has **zero** interactive components. Everything is a one-shot reply. This is where the modern API has moved furthest.

### 3a. Components V2 **[verify]**
Discord introduced a new component-layout system (opt-in via a message flag, roughly `MessageFlags.IsComponentsV2`) with builders along the lines of `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `SeparatorBuilder`, `MediaGalleryBuilder`, `ThumbnailBuilder`. It replaces the embed model with composable layout primitives, and is **mutually exclusive with `content`/`embeds` on the same message**.

Relevance here is high — marketplace listings and screenshot submissions are exactly the "image + structured fields + actions" shape this was designed for. **Confirm the current builder names, the flag, and the stability status against the discord.js guide before designing around it**; treat the embed-based approach as the fallback.

### 3b. Buttons & select menus
- **Marketplace listing** → `Mark as sold` / `Bump` / `Delete` buttons on the listing message itself. This directly replaces the old bot's `has-been-sold` polling script with a user action.
- **`/trophy rank`** → prev/next pagination buttons instead of the `limit` option capped at 10.
- **Screenshot contest** → vote buttons instead of counting 🏆 reactions. The current `GetScreenshotWinnerHandler` fetches every message of the week one-by-one and reads `reactions.cache` — slow, rate-limit-prone, and it silently skips messages it can't fetch.

Requires a `Events.InteractionCreate` branch for `isButton()` / `isStringSelectMenu()`, plus a `customId` routing convention (e.g. `marketplace:sold:<adId>`) and — importantly — an **authorisation check inside the component handler**, since anyone can click anyone's button.

### 3c. Modals
`/marketplace sell` currently takes **seven** slash-command options, two of them long free text. A modal (`ModalBuilder` + `TextInputBuilder`, `Paragraph` style for description) is the idiomatic shape and gives multi-line input, which slash options cannot. **[verify]** newer modal component types (label/select-in-modal) if they've landed.

### 3d. Autocomplete — highest value, lowest effort
`/marketplace delete` and `/screenshot delete` both ask the user to paste a **UUID**. `DeleteAdSubcommand.ts:24-36` works around this with a positional-index hack (`/^\d+$/` → "the Nth ad"), which is fragile and undiscoverable.

Autocomplete solves it properly: `option.setAutocomplete(true)`, then handle `interaction.isAutocomplete()` and respond with up to 25 choices (`{ name: "Sony WH-1000XM5 — 180€", value: "<uuid>" }`) filtered to the invoking user's own records. Must respond within **3 seconds** and cannot be deferred, so keep the query indexed and cheap.

### 3e. Context menus
`ContextMenuCommandBuilder` — right-click a message → "Submit as screenshot", or right-click a user → "View trophy profile". Cheap to add once interaction routing is typed.

---

## 4. Command registration & install contexts

`DiscordBot.registerSlashCommands()` (`DiscordBot.ts:60-83`) has four problems:

1. **Global-only** — `Routes.applicationCommands(clientId)`. Global commands can take up to an hour to propagate; there is no fast dev loop. Add guild-scoped registration (`Routes.applicationGuildCommands(clientId, guildId)`) behind a `DISCORD_GUILD_ID` env var for development.
2. **Errors are swallowed to `console.error`** — bypassing the injected `Logger`, and the bot then starts happily with a stale command set. Should fail loudly.
3. **Unconditional `PUT` on every boot** — re-registers all commands on each restart. Hash the serialised command array and skip the write when unchanged.
4. **No registration metadata:**
   - `setDefaultMemberPermissions(...)` — nothing is permission-gated today; every member can run everything.
   - `setContexts([InteractionContextType.Guild])` — commands are currently invokable in DMs, where `ListAdsSubcommand`'s `https://discord.com/channels/${guildId}/...` link builds with `guildId === null`.
   - `setIntegrationTypes(...)` — declares guild-install vs user-install. Even if you only want guild installs, **declaring it explicitly is now the expected practice**. **[verify]** exact enum names.
   - `setNameLocalizations` / `setDescriptionLocalizations` — see §7.

---

## 5. Client configuration

`new Client({ intents: [GatewayIntentBits.Guilds] })` (`DiscordBot.ts:20`) is minimal and correct — no privileged intents needed, which is good and should stay that way. But several defaults deserve overriding:

- **`allowedMentions: { parse: [] }` at the client level.** Currently unset, and `SellSubcommand` concatenates user-supplied ad text into message *content* — so a listing named `@everyone` makes the bot ping the server. This is the single most important line in this plan. Set it globally and opt in per-message where a real mention is intended (e.g. the winner announcement).
- **Cache limits.** discord.js caches aggressively by default. For a long-lived single-guild bot, `makeCache: Options.cacheWithLimits({...})` plus `sweepers` bounds memory. `messages` and `users` are the ones that grow. **[verify]** current option names.
- **`rest` options** — timeouts, retries, and the `REST` client's rate-limit events are worth wiring into the `Logger` for observability (see §6).
- **Partials** — only needed if you keep the reaction-counting path (§3b); uncached reaction events arrive partial and need fetching.

---

## 6. Rate limits & resilience

- `@discordjs/rest` handles per-route buckets and the global limit automatically, but it emits events (rate-limit hits, invalid requests) that this bot **ignores**. Wire them to the Loki logger — an invalid-request spike is how you find out you're heading for a Cloudflare ban before it happens.
- `GetScreenshotWinnerHandler` does a **sequential fetch per screenshot per week**, each a REST round-trip, with per-item try/catch that logs and continues. As submissions grow, this will hit rate limits and silently drop candidates. Moving to button-based voting (§3b) eliminates the fetch loop entirely.
- **No `Events.Error` / shard error handlers**, no `process.on('unhandledRejection' | 'uncaughtException')`, no **SIGTERM graceful shutdown** — the container is killed without `client.destroy()` or `prisma.$disconnect()`. On CapRover redeploys that leaves gateway sessions dangling.
- **Sharding is not needed** — required only past ~2500 guilds. Explicitly out of scope; noting it so nobody adds it speculatively.

---

## 7. Localisation

The community is Portuguese; every command name, description, and reply string is English. `setNameLocalizations` / `setDescriptionLocalizations` (`pt-BR`, and **[verify]** whether `pt-PT` is a supported locale — Discord's locale list is finite and I can't confirm it here) localise the command surface. Reply strings need a small i18n layer of their own; there is currently no message-catalogue abstraction at all.

---

## 8. Attachment URL expiry

Discord CDN attachment URLs are **signed and expiring**. `screenshots.image` (`prisma/schema.prisma`) stores the raw `image.url` from the interaction, so stored URLs die within roughly a day. The re-upload at submission time (`files: [image.url]`) works, but the archive rots — and the MD5 dedupe in `CreateScreenshotHandler` re-fetches that URL, so **dedupe against older rows will fail once the URL expires**.

Options: (a) re-host to object storage (S3/R2) on submit — most robust; (b) store `channel_id` + `message_id` and re-fetch the fresh URL on demand; (c) **[verify]** Discord's attachment-URL refresh endpoint, which exchanges expired URLs for fresh signed ones.

---

## 9. discord.js v15 horizon **[verify]**

A v15 major has been in development (builders overhaul, tighter `@discordjs/core` split, removal of the deprecations in §1, higher minimum Node). **Do not block on it** — but every §1 fix is also v15 preparation, which is a good reason to do them now rather than at migration time under pressure.

---

## Proposed sequencing

**Phase A — Deprecations & safety (small, ship first)**
1. `allowedMentions: { parse: [] }` on the Client + on replies echoing user input. *(This one is urgent — it's live mass-ping exposure.)*
2. Fix P1 (public "ephemeral" errors), P2, P3.
3. Add the `respond()` helper and fix P4 everywhere.
4. `Events.Error`, `unhandledRejection`/`uncaughtException`, SIGTERM graceful shutdown.

**Phase B — Type the interaction layer (the enabler)**
5. Replace `interaction: any` with `ChatInputCommandInteraction` in `SlashCommandContext`.
6. Introduce a discriminated `InteractionContext` covering chat-input / autocomplete / component / modal, and branch `Events.InteractionCreate` accordingly.
7. Extend `SlashCommandHandler` with optional `autocomplete()` / `component()` hooks; type `builder()` as `SlashCommandBuilder` instead of `any`.
   *Requires `tsc --noEmit` in CI — see the [dependency plan](07-dependency-upgrades.md) Step 2 — or none of this is enforced.*

**Phase C — Lifecycle & registration**
8. `deferReply()` in every non-trivial handler.
9. Registration overhaul: guild-scoped dev path, hash-diffed writes, loud failures, `setDefaultMemberPermissions` + `setContexts` + `setIntegrationTypes`.
10. Client cache limits + sweepers; REST rate-limit events → Logger.

**Phase D — New surfaces (feature work, prioritise by value)**
11. **Autocomplete** on both delete commands. *(Best value/effort in the whole plan.)*
12. Marketplace listing buttons (sold / bump / delete).
13. `/marketplace sell` modal.
14. `/trophy rank` pagination buttons.
15. Components V2 evaluation for listings & screenshots **[verify]** — spike first, decide after.
16. Context menus.
17. Localisation.

Phases A–C are hardening and should land before D. Within D, item 11 is the one users will notice immediately.
