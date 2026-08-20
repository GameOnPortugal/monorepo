# Discord bot — feature gap between `old-discord-bot` and `discord-bot`

Mapping of everything the legacy bot (`old-discord-bot/`, Node 15 + discord.js v12 + Sequelize)
does that the rewrite (`discord-bot/`, Bun + discord.js v14 + Prisma + Inversify) does **not** do yet.

Method: full read of `old-discord-bot/src` (commands, subcommands, services, utils, events) and
`old-discord-bot/scripts`, compared against `discord-bot/src`, `discord-bot/bin/console.ts`,
and `discord-bot/prisma/schema.prisma`. (Note: the `scheduler/` directory was deleted 2026-08-19;
historical references to `scheduler/config.ini` below are kept for context.)

> Note on the DB: `discord-bot/prisma/schema.prisma` **already declares every legacy table**
> (LFG*, StockUrls, SpecialChannel, CommandChannelLink, …). The models exist, but no domain,
> repository, handler or command uses them. So most gaps below are "wiring + behaviour", not schema.

---

## 1. Summary

Legend: ✅ ported · 🟡 partially ported (behaviour differs / degraded) · ❌ missing entirely ·
🚫 **decided not to port** (2026-08-19 — see [the decisions in the global plan](plans/GLOBAL-PLAN.md#decisions-taken))

> **Six of these rows are now closed by decision rather than by work.** LFG (13,
> 14), stock alerts and the Telegram bridge (15, 23), command→channel links (17)
> and the trophy webhook (24) will not be ported. Channel restrictions (16) will
> be reimplemented on Discord AutoMod rather than ported. The reasoning for each
> is in the global plan; the detail sections below are kept because they remain
> the only written record of what the old bot did.

| # | Feature | Legacy entry point | New bot | Status |
|---|---------|--------------------|---------|--------|
| 1 | Ping | `commands/ping.js` | `/ping` | ✅ |
| 2 | Marketplace — sell ad | `commands/market/sell.js` | `/marketplace sell` | 🟡 |
| 3 | Marketplace — wanted ad (`\|want` / `\|procuro`) | `commands/market/wanted.js` | — | ❌ |
| 4 | Marketplace — list / delete ads | `commands/market/sell.js` | `/marketplace list`, `/marketplace delete` | 🟡 |
| 5 | Marketplace — "has it been sold?" ad renewal cron | `scripts/has-been-sold.js` | — | ❌ |
| 6 | Screenshot — create / list / delete | `commands/screenshot/screenshot.js` | `/screenshot …` | 🟡 |
| 7 | Screenshot — weekly winner | `scripts/screenshot-winners.js` | `bun run:command week-screenshot-winner` | 🟡 |
| 8 | Trophy — link PSN profile | `commands/trophy/trophy.js` | `/trophy create` | 🟡 |
| 9 | Trophy — check profile | `commands/trophy/trophy.js` (`check`) | `/trophy check` | 🟡 |
| 10 | Trophy — ranks (monthly/creation/lifetime/user) | `commands/trophy/trophy.js` (`rank`) | `/trophy rank` | 🟡 |
| 11 | Trophy — PSNProfiles crawler + points engine | `service/trophy/psnCrawlService.js`, `trophyManager.js`, `scripts/parse-psn-profile.js` | — | ❌ |
| 12 | Trophy — backfill missing completion dates | `scripts/fix-old-trophies.js` | — | ❌ |
| 13 | LFG — whole subsystem (11 subcommands) | `commands/lfg/lfg.js` + `subcommands/lfg/*` | — | 🚫 §5 |
| 14 | LFG — points recalculation cron | `scripts/lfg-update-points.js` | — | 🚫 §5 |
| 15 | Stock alerts (Discord + Telegram) | `commands/stock/stock.js` | — | 🚫 §7.5 |
| 16 | Channel restrictions (`setchannel`) + message validator | `commands/channel/setChannel.js`, `util/MessageValidator.js` | — | 🚫 §6.1 — replaced by AutoMod |
| 17 | Command→channel routing (`commandchannellink`) | `commands/channel/commandChannelLink.js` | — | 🚫 §6.2 |
| 18 | Configurable command prefix | `commands/prefix.js`, `util/prefixUtil.js` | — | ❌ (obsolete by design, see §7.1) |
| 19 | Admin / moderator permission checks | `util/permissionsUtil.js` | — | ❌ |
| 20 | DM conversational wizards + interaction lock | `util/messageCreatorUtil.js` | — | ❌ (superseded, see §7.2) |
| 21 | 2000-char message chunking | `util/messageCreatorUtil.js` `sendMessage` | — | ❌ |
| 22 | Sentry error reporting | `src/index.js` | — | ❌ (Loki logging instead) |
| 23 | Telegram bridge | `service/stock/stockUrlManager.js` | — | 🚫 §7.5 |
| 24 | Trophy webhook announcements | `scripts/parse-psn-profile.js` (`TROPHY_WEBHOOK`) | — | 🚫 §7.7 — replaced by a channel post |
| 25 | Redis / Keyv caching | `util/prefixUtil.js`, `MessageValidator.js`, `commandChannelLinkManager.js` | — | ❌ |

---

## 2. Marketplace

### 2.1 `wanted` ads — ❌ missing
Legacy `|want` / `|procuro` created an ad with `adType: 'wanted'` and a `:mag: **PROCURO**` layout
(name, price, zone, state, dispatch, warranty, description). The new `/marketplace sell` hardcodes
`adType: 'sale'` (`SellSubcommand.ts`) and there is no wanted flow. Note the value drift too:
legacy stored `'sell'`, the rewrite stores `'sale'` — decide which wins before importing old rows.

**Needed:** `/marketplace wanted` subcommand + `adType` handling in `CreateAd`/`CreateAdHandler`.

### 2.2 Ad deletion does not delete the Discord message — 🟡
Legacy `service/market/adManager.js#delete` deleted the channel message (via `channel_id` +
`message_id`) **and** the row. `DeleteAdHandler` only deletes the row, so the posted ad stays
visible in the channel forever.

**Needed:** message deletion through `GuildClient` (which currently only supports the screenshots channel).

### 2.3 No admin override on delete — 🟡
Legacy allowed staff to delete anyone's ad (`PermissionUtil.isAdmin`). `DeleteAdHandler` throws
`UnauthorizedAdDeletion` for any non-owner, including admins. Depends on §7.3.

### 2.4 Ad posting target channel — 🟡
Legacy posted through `MessageCreatorUtil.post`, which redirected the ad to the channel configured
via `commandchannellink` (§6.2). The rewrite replies in whatever channel the interaction happened in.

### 2.5 "Has it been sold?" renewal cron — ❌ missing
`scripts/has-been-sold.js` (was `@hourly`, now commented out in `scheduler/config.ini`) was a
significant piece of business logic:

- finds ads older than 1 week, max one per author (`findOldestAds`);
- DMs the author an embed with ✅ / ❌ reactions and a 3h window;
- ✅ on a *sell* ad or ❌ on a *wanted* ad → delete ad + channel message;
- ❌ on a *sell* ad or ✅ on a *wanted* ad → **repost** it as a fresh message and recreate the row (renewal);
- no answer within 3h → delete the ad and tell the user;
- DM closed / message vanished → delete the ad to avoid orphans;
- then walks the rest of that user's stale ads (`findOldestAdsByUser`).

**Needed:** `findOldestAds` / `findOldestAdsByUser` on `AdRepository`, a console command, DM +
reaction-collector capability on `GuildClient`, and re-enabling the job in `scheduler/config.ini`.

---

## 3. Screenshots

Mostly ported. Remaining deltas:

| Legacy behaviour | New bot |
|---|---|
| Posted into the configured screenshots channel via `commandchannellink` | Replies in the invoking channel (`CreateScreenshotSubcommand`) |
| Deleting a screenshot also deleted the channel message (`screenshotManager#delete`) | `DeleteScreenshotHandler` deletes the row only |
| Preview + explicit sim/não confirmation before posting | No preview step (slash-command form instead) |
| Weekly winner posted `========= Concurso DD/MM ABERTO ===========` opening banner for the next contest | `WeekScreenshotWinner` posts the congratulation + `!give-xp … 1000` only |
| Weekly winner deleted screenshots whose message had vanished | `GetScreenshotWinnerHandler` logs the error and skips |
| Week window = last Monday → last Sunday (`dayjs.weekday(-6)`/`weekday(0)`) | `ScreenshotRepository.findByWeek(date)` — **verify the window matches** before trusting parity |

MD5 duplicate detection ✅ and the trophy-plat reaction ✅ are both ported.

---

## 4. Trophies

The read side (profiles, ranks) was ported; **the entire data-producing side was not**.

### 4.1 PSNProfiles crawler — ❌ missing (biggest trophy gap)
`service/trophy/psnCrawlService.js` (JSDOM + jQuery scraping):
- `getPlatTrophyData(url)` → platinum rarity % + completion date (`Do MMM YYYY`), incl. the
  blank-first-row workaround and "not earned yet" detection;
- `getProfileRank(username)` → world + country rank;
- `getProfileTrophies(username, page)` → paginated list of platinum trophy URLs.

Without it, `trophies` rows are never created, so `/trophy rank` can only ever report data
imported from the legacy DB.

### 4.2 Points engine — ❌ missing
`service/trophy/trophyManager.js#transformPercentageIntoPoints` — the rarity→TP ladder:

| Platinum rarity | TP |
|---|---|
| > 30.01% | 50 |
| > 15.01% | 100 |
| > 8.01% | 250 |
| > 5.01% | 500 |
| > 2.01% | 800 |
| > 0.6% | 1250 |
| ≤ 0.6% | 2000 |

Plus `TrophyAlreadyClaimedException` (one claim per profile+URL).

### 4.3 Profile sync job — ❌ missing
`scripts/parse-psn-profile.js` (was `@every 10m`, commented out in `scheduler/config.ini`):
- iterates non-excluded profiles, walks all platinum pages, creates missing trophies;
- stops early once it hits an already-claimed trophy (catch-up mode), unless `--all --profile=X`;
- **auto-moderation**: no world/country rank → flag `isBanned` + `isExcluded`; Discord error 10007
  (member left the guild) → flag `hasLeft` + `isExcluded`;
- announces each new trophy through the `TROPHY_WEBHOOK` Discord webhook
  ("Parabéns <@user>! Acabaste de receber N TP …").

The rewrite has no `flagAsBanned` / `flagAsExcluded` / `flagAsLeaver` equivalents on
`TrophyProfileRepository`, so those flags are read (`/trophy check`) but never written.

### 4.4 `fix-old-trophies` backfill — ❌ missing
`scripts/fix-old-trophies.js` re-scraped `completionDate` for trophies where it was null. One-off,
but worth keeping as a console command if legacy rows are imported.

### 4.5 `/trophy check` no longer shows ranks — 🟡
Legacy printed the psnprofiles URL plus live world/national rank and a specific message when the
profile is banned/left. The new embed only shows the stored boolean flags and timestamps
(no live lookup — it depends on §4.1).

### 4.6 `/trophy create` accepts trophy URLs too — 🟡
Legacy `getPsnProfileByUrl` accepted both `https://psnprofiles.com/<user>` and a 6-segment trophy
URL (`.../trophies/<id>-<game>/<user>`). The rewrite's `extractPsnProfileFromUrl` should be checked
against both shapes. Legacy also DM'd the user on success and on invalid URL.

### 4.7 Rank presentation — 🟡
Legacy rendered ranks with the guild's custom trophy emojis (plat/gold/silver/bronze for positions
1/2/3/rest, `enum/discord/emojiEnum.js`) and a top-5 default. Worth diffing against `RankSubcommand`.

---

## 5. LFG (Looking For Group) — 🚫 will not be ported

> **Decided 2026-08-19: Luis is not interested in moving LFG.** This was the
> largest single item in the revival plan — roughly 40% of the old bot's command
> surface — and it is now closed. The four Prisma models (`LFGProfile`,
> `LFGGame`, `LFGParticipation`, `LFGEvent`) and their tables are **empty**, so
> there is no data to preserve; they get dropped with M9.6. Nothing below is
> scheduled work. It is kept as the only written record of what the old
> subsystem did, in case the decision is ever revisited — note that if it is,
> this is a greenfield build with **no continuity** with the community's old
> rankings, which is worth telling members explicitly.

The largest missing subsystem. Legacy: `commands/lfg/lfg.js` + 11 subcommands +
`service/lfg/{lfgEventManager,lfgGamesManager,lfgProfileManager}.js`. Prisma already has
`LFGProfile`, `LFGGame`, `LFGParticipation`, `LFGEvent`; nothing reads or writes them.

### 5.1 Subcommands

| Command | What it did |
|---|---|
| `lfg create` | DM wizard (game, platform ∈ PC/PS/PS4/PS5/XBOX/SWITCH, description, group size, `DD-MM-YYYY HH:MM` or `HH:MM` in the future) → embed posted to the **platform-specific** LFG channel → 👍/❌ reaction collector running until the session start time, live-editing the embed with the participant list |
| `lfg cancel <id>` | Author-only, blocked after start; confirmation prompt; **double point penalty if < 1h to start**; removes all participations and DMs every participant |
| `lfg miss <game_id> <@user> <details>` | Report a no-show (one per game+target); requires an LFG profile or admin |
| `lfg report [<game_id>] <@user> <reason>` | Opens an unaddressed report for staff |
| `lfg reports [<@user>]` | Reports *filed by* a user |
| `lfg reported [<@user>]` | Reports *filed against* a user |
| `lfg resolve <report_id> <points> <notes>` | Admin resolves a report, assigning the point delta |
| `lfg commend [<game_id>] <@user> <reason>` | Praise a player — **max 5 per rolling 7 days** |
| `lfg rank [monthly [MM\|M/YYYY\|MM/YYYY] \| lifetime]` | Leaderboards |
| `lfg ban <@user> <reason>` | Admin ban from LFG + audit embed to the LFG-moderation channel |
| `lfg unban <@user> <reason>` | Reverse, same audit embed |

### 5.2 Points model (`enum/discord/lfgEventsEnum.js`)

| Event | Points |
|---|---|
| `game_create` | +20 |
| `participation` | +10 |
| `commendation` | +5 |
| `ban` / `unban` / `report` | 0 (report scored later on resolve) |
| `leaving` | −10 |
| `miss` | −30 |
| `game_cancel` | −20 (**×2** when cancelled < 1h before start) |

### 5.3 Points aggregation cron — ❌ missing
`scripts/lfg-update-points.js` → `lfgProfileManager#updateLfgPoints`: sums `is_addressed = 1 AND
is_parsed = 0` events per profile into `LFGProfile.points`, then marks them `is_parsed = 1`.
Was `@every 10m`, commented out in `scheduler/config.ini`.

### 5.4 Banned-user enforcement
Banned profiles couldn't create LFGs and had their reactions stripped from LFG posts, with an
explanatory DM.

### 5.5 Hardcoded IDs to migrate
LFG channels per platform in `enum/discord/channelEnum.js` (PS `859459970236284998`, XBOX
`892332852404973598`, SWITCH `892334699735842817`, PC `892333259554431016`) and the
LFG-moderation channel `1003663012256825484` inlined in `ban.js`/`unban.js`. These belong in
`Domain/Community/CommunityChannels.ts` + `Infrastructure/Community/Discord/DiscordChannels.ts`,
which currently only knows `SCREENSHOTS`.

---

## 6. Moderation / channel configuration — 🚫 reimplemented, not ported

### 6.1 `setchannel` + message validator — replaced by Discord AutoMod
`commands/channel/setChannel.js` (admin/mod only) attached restrictions to a channel, stored in
`SpecialChannel`, with `info` / `delete <id>` / `delete all` management. Enforcement lived in the
`message` event via `util/MessageValidator.js`:

- **`regex`** handler — message must match a stored regex;
- **`only_commands`** handler — only a listed set of commands (or a bot mention) is allowed, and it
  DMs the user the allowed list;
- admins/moderators bypass everything;
- offending message is deleted and DM'd back to the author with a "fala com o ModMail" note;
- restrictions cached in Keyv, invalidated on every `setchannel` write.

This is the enforcement layer the marketplace and screenshot channels were designed around, and it
is worth having. **It is not worth having this way.** A straight port needs the `MessageContent`
privileged intent, a gateway message-event pipeline the rewrite does not have at all (it requests
only `GatewayIntentBits.Guilds` and handles only `InteractionCreate`), and a per-message round trip
through the bot — in order to do something Discord has since built in.

**Decided 2026-08-19 — reimplement on Discord AutoMod instead** (work item M9.1):

- the **`regex`** handler maps directly onto an AutoMod rule with a regex trigger, applied through
  `@discordjs/rest`, with the rule definitions checked into this repo so the configuration is
  reviewable rather than living only in the Discord UI;
- **`only_commands`** is not a moderation problem at all — it is a channel permission overwrite
  (deny `SendMessages`, allow `UseApplicationCommands`). No code, and it cannot be raced;
- admin bypass comes free — AutoMod rules take `exempt_roles`.

What this buys beyond simplicity: AutoMod **blocks the message instead of deleting it after the
fact**, so nothing is ever briefly visible, and it keeps enforcing while the bot is down or
redeploying — which the old validator did not. What it costs: the custom "fala com o ModMail" DM
becomes AutoMod's standard block notice. That is an acceptable trade.

The `specialchannels` table holds **0 rows**, so nothing is being migrated. The model is dropped
with M9.6.

### 6.2 `commandchannellink` — 🚫 dropped

> **Decided 2026-08-19.** The `commandchannellinks` table holds **0 rows** and the static channel
> configuration from M1.7 covers every real use — M5.1 already routes ads to `📖anuncios` that way.
> A configurable indirection nobody configured is worse than a constant. The model is dropped with
> M9.6 rather than left lying around inviting someone to wire it up.

Mapped a command name to a target channel so all content generated by that command was posted
there (`CommandChannelLink` table, Keyv-cached, `info`/`delete`/`delete all`). Used by sell, wanted,
screenshot and LFG create. Without it the rewrite always answers in the invoking channel (§2.4, §3).

---

## 7. Cross-cutting / infrastructure

### 7.1 Prefix system — obsolete by design
`|` prefix + `|prefix <new>` (Redis-backed via Keyv). The rewrite is slash-command-only, so this
does not need porting — but §6.1's `only_commands` handler is written in terms of prefixes and will
need rethinking for slash commands.

### 7.2 DM wizards & interaction lock — superseded, with one loss
Legacy asked questions one at a time in DMs (30–60s timeouts) with a preview + `sim/não`
confirmation, and a 120s per-user lock (`lockInteraction`) to stop concurrent wizards. Slash
command options replace most of this. **What is genuinely lost is the preview/confirm step** before
anything goes public.

### 7.3 Permissions — ❌ missing
`util/permissionsUtil.js` checked for the `Admin` / `Moderator` role names. Nothing equivalent
exists in the rewrite, so every admin-gated behaviour (§2.3, §5, §6) is blocked on this.

### 7.4 Long-message chunking — ❌ missing
`MessageCreatorUtil.sendMessage` split output at 1800 chars to respect Discord's 2000-char limit.
Relevant for long ad/screenshot/rank listings.

### 7.5 Stock alerts + Telegram bridge — 🚫 dropped

> **Decided 2026-08-19.** `stockurls` holds **0 rows** — the feature has not been used once in the
> sixteen months the rewrite has been live. This also removes the only reason for the bot to carry a
> Telegram dependency, and `TELEGRAM_ACCESS_TOKEN` leaves `.env.example` with it. Had it been kept,
> it would have needed rebuilding rather than porting anyway: see the `setTimeout` note below.
`|stock create|verify|alert <url>` (`commands/stock/stock.js`, `service/stock/stockUrlManager.js`):
- store/validate stock URLs (`StockUrls.is_validated`, validated out-of-band);
- `alert` fan-out ladder: immediate Telegram *Alertas Prime* + Discord premium channel ping
  (`@&824292750446297140` in `824274601026256996`) → **+3 min** `@everyone` in the free Discord
  channel `818448862779146270` → **+5 min** Telegram *everyone* chat.

Needs `node-telegram-bot-api` (or equivalent), `TELEGRAM_ACCESS_TOKEN` (still present in
`.env.example` but unused), role/channel enums, and a delayed-dispatch mechanism — the legacy
`setTimeout` version silently lost pending alerts on restart.

### 7.6 Sentry — ❌ missing
`old-discord-bot/src/index.js` initialised `@sentry/node` (+ tracing). The rewrite ships Winston +
Loki (`LokiLogProvider`) instead. **Decided 2026-08-19: Loki, and `SENTRY_DSN` is dropped.** One
pipeline for one signal, and Loki is the one already half-wired with a Grafana Cloud stack behind
it. Two caveats for whoever finishes the wiring: `LokiLogProvider` currently tags this bot's logs
`job: 'tedcrypto-campaign'` (fix in M3.5), and **`LOKI_HOST` must not be enabled until M0.7 lands**
— the entrypoint prints the database password on its first line, and turning Loki on first ships
that password to Grafana Cloud.

### 7.7 Trophy webhook — 🚫 dropped, but the announcement is kept

`TROPHY_WEBHOOK` (discord-webhook-node) announced each newly-credited trophy. Still in
`.env.example`, unused.

> **Decided 2026-08-19.** The announcement is worth restoring; the webhook is not. It should be
> posted by the bot itself through `GuildClient`, to a channel named in the M1.7 channel config.
> Same message to the member, one fewer secret to manage, one fewer thing that breaks silently when
> someone regenerates a webhook URL — and the post gets the bot's identity and embed styling rather
> than an anonymous webhook avatar. Tracked as **M7.8**; `TROPHY_WEBHOOK` is deleted.

### 7.8 Redis / Keyv caching — ❌ missing
Legacy cached channel restrictions, command→channel links, the prefix and interaction locks
(`REDIS_DSN`, still in `.env.example`, unused; the old `docker-compose.yml` ran a Redis container,
the new one does not). §6 is not coming back in a form that needs it — AutoMod holds its own rules
and channel permissions are enforced by Discord — so `REDIS_DSN` is dropped with the rest.

### 7.9 Scheduled jobs
`scheduler/config.ini` currently runs exactly one job:

```
[job-exec "weekly-screenshot-winner"]  schedule = 50 23 * * 0   # bun run:command week-screenshot-winner
```

Commented out and awaiting a rewrite equivalent: `parse-psn-profiles` (@every 10m),
`update-lfg-points` (@every 10m), `has-been-sold` (@hourly).

### 7.10 Generic command affordances
Legacy gave every command `help` (prints usage), `guildOnly`, a `args`-required usage message that
self-deleted after 30s, and command aliases (e.g. `procuro` → `want`). Slash commands cover
descriptions/validation natively; only aliases and the localisation of help text are lost.

### 7.11 Language
All legacy user-facing copy is **Portuguese**; the rewrite's replies are **English**. Not a missing
feature, but a deliberate decision worth confirming with the community before cutover.

---

## 8. Suggested porting order

1. **Permissions + channel enums** (§7.3, §5.5) — unblocks everything else, small.
2. **Marketplace completion** — wanted ads (§2.1), message deletion on delete (§2.2), admin
   override (§2.3). Small, and the marketplace is already live.
3. **`has-been-sold` renewal job** (§2.5) — without it ads accumulate forever. Needs DM + reaction
   support on `GuildClient`.
4. **Trophy crawler + points + sync job** (§4.1–4.4) — `/trophy rank` is a shell until this lands.
5. **Channel restrictions / message validator** (§6.1) — needs the `MessageContent` intent and a
   message-event pipeline; the moderation value is high.
6. **LFG** (§5) — largest scope; schema is ready, everything else is greenfield.
7. **Stock alerts + Telegram** (§7.5) — decide first whether the community still uses it.
8. **Housekeeping** — Sentry vs Loki decision (§7.6), unused env vars (`SENTRY_DSN`,
   `TROPHY_WEBHOOK`, `TELEGRAM_ACCESS_TOKEN`, `REDIS_DSN`), message chunking (§7.4).
