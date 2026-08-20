# Plan 01 — Marketplace overhaul

**Goal**: make `/marketplace` correct, complete and pleasant to use on a phone,
in Portuguese, without losing the 70 ads already in the database.

Read [`00-overview.md`](00-overview.md) first — it holds the shared context,
the data reality, and the decisions that are already settled.

## Why this is first

`/marketplace sell` fails on **every** invocation today (issue #0 in
[`../known-issues.md`](../known-issues.md)), and it has done since the rewrite
shipped in April 2025. The ad saves, the listing posts, and then the message-ID
write-back throws — 28 of 33 post-rewrite ads carry `message_id = ''`.

## Current implementation

| File                                                     | Role                                    |
| -------------------------------------------------------- | --------------------------------------- |
| `…/SlashCommand/Marketplace/MarketplaceSlashCommand.ts`  | Builder + routes `sell`/`list`/`delete` |
| `…/Marketplace/SellSubcommand.ts`                        | Creates + posts (broken)                |
| `…/Marketplace/ListAdsSubcommand.ts`                     | Embed of a user's ads                   |
| `…/Marketplace/DeleteAdSubcommand.ts`                    | Delete by position or UUID              |
| `Application/Write/Marketplace/CreateAd/*`               | Command + handler (returns `void`)      |
| `Application/Write/Marketplace/DeleteAd/*`               | Command + handler + auth check          |
| `Application/Query/Marketplace/ListUserAds/*`            | Query + handler                         |
| `Domain/Marketplace/{Ad,AdId,AdRepository,…}.ts`         | Entity, VO, repo interface              |
| `Infrastructure/Orm/OrmAdRepository.ts`                  | Prisma implementation                   |

## Defects and gaps, in priority order

**Correctness**

1. **Write-back always throws.** `CreateAdHandler.handle()` returns
   `Promise<void>`; `SellSubcommand` does `const ad = await …handle(command)`
   then reads `ad.id`. Every ad is stored with the `''` placeholder.
2. **Double reply.** The `catch` calls `interaction.reply()` when a reply has
   already been sent, producing `InteractionAlreadyReplied` and hiding the real
   error from the user.
3. **Ads post wherever the command is typed.** `channel_id` is
   `interaction.channelId` and the listing is the interaction reply — so running
   `/marketplace sell` in `💬chat` dumps a listing into the chat channel. Five
   ads have already landed there.
4. **Deleting an ad leaves its message in the channel forever.** The old bot
   deleted both (`AdManager.delete` removed the Discord message first); the
   rewrite only deletes the row. The channel is accumulating listings for ads
   that no longer exist.
5. **Broken "View Listing" links.** `ListAdsSubcommand` builds
   `discord.com/channels/{guild}/{channel}/{message}` from a `message_id` that is
   usually `''`.
6. **`state` is overloaded.** It holds *condition*, and there is no lifecycle
   field at all — no way to express sold, expired or withdrawn.
7. **Type errors** at `DeleteAdSubcommand.ts:32` and `:59`, and four in
   `OrmAdRepository.ts` caused by the schema drift (issue #1). Fix them here.

**UX**

8. **English copy in a Portuguese community.**
9. **Seven required-ish slash options** is a poor mobile flow.
10. **No images.** A marketplace without photos.
11. **No search or browse** — only "list a user's ads".
12. **No pagination**; an embed is capped at 25 fields, so a prolific seller
    breaks the command outright.
13. **`list` replies publicly**, adding noise to whatever channel it was run in.
14. **No edit, no bump, no mark-as-sold.**
15. **No admin override** — the old bot let admins remove others' ads.
16. **No limits** — nothing stops one user posting fifty listings.

**Data**

17. `adType` has three values for two concepts (`sell` 35 / `sale` 28 /
    `wanted` 7).
18. `zone`, `price` and legacy `state` are unnormalised free text.

## Target design

### Commands

| Command                          | Behaviour                                                        |
| -------------------------------- | ---------------------------------------------------------------- |
| `/marketplace sell`              | Create a sale listing. Ephemeral ack → posts to `📖anuncios`.     |
| `/marketplace wanted`            | Same flow, `adType = wanted`. Restores an old-bot feature.        |
| `/marketplace list [user]`       | Ephemeral, paginated, shows status, working links.                |
| `/marketplace search …`          | Browse by keyword / zone / type / condition / max price.          |
| `/marketplace edit <id>`         | Modal to amend price/description; re-renders the posted message.  |
| `/marketplace sold <id>`         | Marks sold, removes the message, keeps the row.                   |
| `/marketplace bump <id>`         | Reposts to the bottom of the channel. Rate-limited.               |
| `/marketplace delete <id>`       | Withdraws: removes the message, soft-deletes the row.             |

### The create flow

Keep slash-command **options** rather than a modal. Modals cannot accept
attachments and cannot hold select menus, so a modal-based flow would make images
impossible and the enums worse; the options UI is also more discoverable. Improve
it instead:

- `zone` gains **autocomplete** backed by the 18 Portuguese districts plus
  `Online/Envio` and `Digital`. Free text still accepted, but the common case is
  two taps.
- `price` is validated (`^\d+([.,]\d{1,2})?\s*€?$`) and stored both as the
  original string and as a parsed `price_cents` integer.
- `image` becomes an attachment option (optional, but strongly encouraged in the
  description).
- `state` and `dispatch` keep their choice lists, translated to pt-PT.

Then the corrected sequence — **post first, persist once**:

```
1. interaction.deferReply({ flags: Ephemeral })      // work may exceed 3s
2. build the embed
3. message = marketplaceChannel.send({ embeds, files })
4. handle(new CreateAd(adId, …, messageId: message.id, channelId: marketplace))
5. interaction.editReply("✅ O teu anúncio foi publicado: <link>")
```

One database write, holding the real message ID. If step 4 fails, an orphaned
message exists and no row — detectable and cleanable by the reconciliation job in
plan 02, and far less bad than today's silent data corruption.

> **Alternative considered**: keep the two-phase write and make
> `CreateAdHandler` return the `Ad`. Rejected — it keeps a partial-failure
> window that writes a knowingly-wrong `message_id`, which is the exact bug being
> fixed. Post-then-persist has no such state.

### The posted listing

An `EmbedBuilder`, in Portuguese, colour-coded by type (sell = mint `#8AFBCC`,
wanted = blue `#4199E7`), with the item image as the embed image, the author as
`setAuthor`, and the ad's short ID in the footer so it can be recovered from the
message alone — the screenshots channel already does this and it is why
screenshots are recoverable and ads are not.

Attach a component row:

| Button                | Who        | Action                                  |
| --------------------- | ---------- | --------------------------------------- |
| `💬 Contactar`        | anyone     | Ephemeral reply with a DM link to seller|
| `✅ Marcar vendido`   | owner/admin| Marks sold, removes the message         |
| `🔄 Renovar`          | owner      | Bump, rate-limited                      |

This needs new infrastructure: `BotExecutor` only handles chat-input commands.
Add a `ButtonHandler` interface in `Domain/Bot/`, a `TYPES.ButtonHandler`
multi-binding, and dispatch in `DiscordBot`'s `InteractionCreate` on
`interaction.isButton()` by `customId` prefix (`mkt:sold:<adId>` etc.). Always
re-check ownership server-side from the ad row — never trust the customId alone.

### Schema changes

One migration, which must **also fix the existing drift** (relax `state`,
`price`, `zone` to nullable to match the migrations and production — issue #1):

```prisma
model Ad {
  // … existing …
  status      String    @default("active")   // active | sold | expired | withdrawn
  price_cents Int?
  images      String?   @db.Text             // JSON array of re-hosted URLs
  bumped_at   DateTime?
  expires_at  DateTime?
  sold_at     DateTime?
  deleted_at  DateTime?

  @@index([status, createdAt])
  @@index([author_id, status])
}
```

Backfill in the same migration: `status='active'`, `expires_at = createdAt + 30d`,
and normalise `adType`: `'sale' → 'sell'` (35 rows already use `sell`, it matches
the old bot, and `wanted` is its natural counterpart). Parse `price_cents` where
`price` is unambiguous; leave `NULL` otherwise.

Leave legacy `state`/`zone` free text alone — a display-time mapping
(`Domain/Marketplace/AdCondition.ts`) should fold the Portuguese variants onto the
enum for the UI, so the portal and the bot agree. Do not rewrite historical rows.

### Limits

- Max **10 active ads** per user (`UnauthorizedAdDeletion`-style domain error).
- `bump` allowed once per ad per **72h**.
- Admins (guild permission `ManageMessages`, or a configured role ID) bypass
  ownership checks on `delete`/`sold`.

## Task breakdown

Each task is one PR, independently reviewable, tests included.

| # | Task | Acceptance |
| - | ---- | ---------- |
| 1 | **Fix the sell bug + double reply.** Minimal change, no schema work: post-then-persist, `editReply` in the catch when already replied. | New integration test proves a created ad has a non-empty `message_id`; manual `/marketplace sell` in staging posts once and replies once |
| 2 | ✅ **PR [#35](https://github.com/GameOnPortugal/monorepo/pull/35)** — **Route ads to `📖anuncios`.** Added `CommunityChannels.MARKETPLACE` + `DiscordChannels` entry; `SellSubcommand` posts via `GuildClient.sendMessage`, not `interaction.reply`. | Running the command in any channel posts the listing in `📖anuncios` only |
| 3 | ✅ **PR [#35](https://github.com/GameOnPortugal/monorepo/pull/35)** — **Delete removes the Discord message.** Extended `GuildClient` with `deleteMessage(channelId, messageId)` — deliberately a **raw channel id**, not `CommunityChannels`, since a stored ad's `channel_id` isn't always the marketplace channel (issue #20); called from `DeleteAdHandler`, tolerates an already-deleted message (404/`UnknownMessage`). Also switched `OrmAdRepository.delete()` from a hard delete to a soft delete (`status='deleted'`, `deleted_at`), since M5.3's whole reason for adding those columns was to stop this hard-delete — read paths (`get`, `findByUserId`) now filter it out. | Deleting an ad removes both row and message; deleting twice does not throw |
| 4 | **Schema migration + drift fix + backfill.** As above. | `prisma migrate diff` reports no drift; `bun test` green; row counts unchanged |
| 5 | **pt-PT copy pass.** All user-facing strings, plus `setDescriptionLocalizations`. | No English remains in any marketplace reply or embed |
| 6 | **Embed + buttons + `ButtonHandler` infrastructure.** | Buttons work; a non-owner pressing "Marcar vendido" is refused |
| 7 | **`sold` / `bump` / `edit` subcommands.** | Each has an integration test; bump respects the 72h limit |
| 8 | **`wanted` subcommand.** | Creates `adType='wanted'`, blue embed, distinct copy |
| 9 | **`list` improvements**: ephemeral, paginated, status-aware, working links. | A user with 30 ads can page through them without hitting the 25-field cap |
| 10 | **`search` subcommand** + `AdRepository.search()`. | Filters by keyword/zone/type/condition/max price, paginated |
| 11 | **Limits + admin override.** | 11th active ad is refused with a clear message; admin can delete another's ad |
| 12 | **Tests for the discord.js layer.** Mocked interactions covering both subcommand paths. | The bug in task 1 would have been caught by this suite |

Tasks 1–3 are the "stop the bleeding" set and could ship as a single PR if the
agent prefers; 4 must land before 6–11.

## Testing

Integration tests live in `tests/Integration/…` mirroring `src/`, run against a
real MariaDB (see AGENT.md). The discord.js layer currently has **no** tests at
all and is where every known bug lives — task 12 is not optional garnish.

For the adapter tests, hand-roll a minimal fake interaction object (the codebase
has no mocking library and does not need one): assert on what the subcommand
*sends*, not on discord.js internals.

## Decisions (settled — do not relitigate)

1. **Do not backfill the 28 orphaned `message_id`s.** Ad messages carry no ad ID,
   so matching would be heuristic and wrong some of the time. Mark them
   `expired` on the first `ads:lifecycle` run and let owners relist. The new
   embed footer carries the ad ID so this is a one-time problem.
2. **Lifecycle timings**: prompt at **14 days** idle, **72h** to respond, expire
   (never delete) at **30 days**. Rationale and comparison with the old bot's
   7d/3h/delete are in plan 02.
3. **`wanted` ads live in `📖anuncios` alongside sales**, distinguished by embed
   colour and title. A second channel splits a small community's attention and
   the old bot did not do it either.
4. **Admin override keys off the `ManageMessages` guild permission**, not a role
   ID. No config to drift, and it already means "can moderate content here".
5. **Item images are re-hosted to MinIO at upload**, never linked from Discord's
   CDN — same bucket and helper as plan 02's screenshot recovery
   (`media.game-on-portugal.pt`, bucket `gop-media`). A marketplace photo that
   dies in 24 hours is the bug that killed the screenshot gallery.
6. **Copy is pt-PT.** Command and subcommand *names* stay English.
