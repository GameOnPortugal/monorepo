# 09 — Portal: identity, credit and the Hall of Fame

Design doc for **M10**. Written 2026-08-21 from a request by Luis, after
reading the tree rather than the older plans — several of the assumptions in
[`03-portal.md`](03-portal.md) have been overtaken by what M8 actually
shipped.

## The request, in Luis's words

1. The portal "is not following our logo or has our community logo" — and
   nobody was sure the repo still had the logo at all.
2. `/admin` should not be advertised in the footer ("prevent people to try
   bruteforce").
3. Screenshots should **credit the player**, link back to the Discord
   message, and show **how many votes / plat trophies** it got.
4. Screenshots should be **sortable by votes / most recent**.
5. **Winners** — "Hall of fame seems to be empty but we did pick some winners
   already" — use the bot to recover them, and introduce a **winner trophy**
   concept if one doesn't exist.
6. Trophies should **link to the real PSN profile**; a **banlist** page with a
   route to appeal on Discord; **instructions** for how to enter the rank
   system and how the marketplace works; and a **placeholder image using the
   logo**.

## What the tree actually holds today (verified 2026-08-21)

**The logo was never lost.** `brand/guild-icon-1024.png` (the flaming
gamepad-skull mark, 836×836) and `brand/logo-lockup-2048.png` (mark +
brush wordmark + platform glyphs) were vendored by M8.1, with a
[measured palette](../../brand/README.md) sampled from the artwork itself.

What M8 did **not** do is put the mark on screen. It is derived into
`portal/web/public/` as favicons and the OG card only. Every on-page
appearance of the brand is the **text** `GAME ON PORTUGAL` set in Archivo
Black — `Layout.tsx`'s header and `Home.tsx`'s hero. So the site is correctly
*coloured* and correctly *typeset* and never once shows the community's actual
mark. That is the whole of complaint 1, and it is a web-only fix.

**The data for complaints 3–5 does not exist yet.** This is the load-bearing
finding:

| What the portal would need | Where it is today |
| -------------------------- | ----------------- |
| A screenshot's vote count | **Nowhere.** Votes are `trophy_plat` reactions (emoji `820982755927392297`) counted **live** off the Discord message by `GuildClient.getTotalReactionsByEmoji`, every time the weekly job runs. Never written back. |
| Who posted a screenshot | Only `screenshots.author_id`, a raw Discord snowflake. **No username/display name is stored**, and `author_id` is deliberately never exposed publicly (`portal/api/src/repositories/screenshots.ts` header). |
| A link to the Discord message | `channel_id` + `message_id` **are** stored, and with `GUILD_ID` = `818108848492773377` a permalink is trivially constructible. Also currently withheld as private. |
| Past winners | **Nowhere.** `GetScreenshotWinnerHandler` computes a winner in memory and announces it; there is no `winners` table and no flag on `Screenshot`. `HallOfFame.tsx` says so honestly and links to Discord — it is a placeholder by design, not an oversight. |

So items 3, 4 and 5 are **bot work first, portal work second**. Anything that
tries to solve them purely in `portal/` would have to invent the data.

### The winners *are* recoverable — and faithfully

The obvious reconstruction — recompute each past week from today's reaction
counts — would be wrong, and quietly so: reactions keep accruing after the
announcement, so a screenshot that lost in 2022 can win in retrospect. It
would publish a Hall of Fame that contradicts what the community was actually
told.

There is a better source. The old bot's `scripts/screenshot-winners.js`
(recovered from git history — the directory was deleted by M9.6, `git show
481661e^:old-discord-bot/scripts/screenshot-winners.js`) posted every winner
into `#screenshots` (`827646847483904040`) in a fixed, machine-readable shape:

```
Parabéns <@AUTHOR_ID> ganhaste o screenshot da semana com NAME. Plataforma: PLATFORM.

<url of the winning message>
```

followed by `!give-xp <@AUTHOR_ID> 1000` and a
`========= Concurso DD/MM ABERTO ===========` banner.

That is the **historical record of who actually won**, written at the time,
still sitting in channel history. It carries the winner's Discord id, the
screenshot name, the platform, the winning message's permalink (whose message
id joins straight back to `screenshots.message_id`) and — via the
announcement's own timestamp — the week. Paging channel history is already a
solved problem here: `GuildClient.listMessages` exists and
`RelinkScreenshotsJob` (M6.3) already pages `#screenshots` for exactly this
kind of archaeology.

**Decision: reconstruct the Hall of Fame by parsing the announcements, not by
recomputing reactions.** Recomputation is the fallback for any week where the
announcement is gone, and any row recovered that way must be stored flagged as
inferred so the page can be honest about it.

## Work items

Sequenced. M10.1–M10.3 and M10.9–M10.10 are independent and shippable
immediately; M10.5 blocks on M10.4, M10.8 blocks on M10.7.

| ID | Item | Layer | Blocked by |
| -- | ---- | ----- | ---------- |
| **M10.1** | **Put the mark on the site.** Derive a transparent mark PNG (and a wide lockup) from `brand/` into `portal/web/public/brand/`, then use it: header lockup beside the wordmark, hero mark above the H1, footer mark. Keep the text wordmark as the accessible name (`alt`), don't replace it with an image-only header. | web | — |
| **M10.2** | **Un-link `/admin` from the footer.** | web | — |
| **M10.3** | **Branded placeholder.** Replace `LazyImage`'s bare "Sem imagem" tile with the mark on `#060302` at low opacity. Covers the 2 dead 2022 CDN links and every future broken URL. | web | — |
| **M10.4** | **Persist votes + author display name.** Schema: `screenshots.vote_count Int?`, `votes_synced_at DateTime?`, `author_name String?`. Capture `author_name` at ingest (`CreateScreenshotHandler`); refresh vote counts on a schedule with a new `ScreenshotVotesSyncJob`; backfill all 624 rows once. | bot (migration + job) | — |
| **M10.5** | **Credit + permalink + votes on the gallery.** Expose `authorName`, `voteCount` and a derived `messageUrl` (never `author_id`/`channel_id`/`message_id` themselves) and render them in the lightbox and tiles. | api + web | M10.4 |
| **M10.6** | **Sort control** — "mais votadas" / "mais recentes". Server-side once `vote_count` is a real column. | api + web | M10.4 |
| **M10.7** | **Winner persistence + historical backfill.** New `ScreenshotWinner` model (screenshot id, author id + name, ISO week, week start/end, vote count at the time, announcement message url, `source: 'announced' \| 'inferred'`). Write a row when `WeekScreenshotWinnerJob` picks a winner; a one-shot `screenshots:backfill-winners` console command reconstructs history by parsing announcements. | bot (migration + job + CLI) | — |
| **M10.8** | **Hall of Fame, for real.** Replace the placeholder with the winner gallery: winning shot, player credit, week, vote count, permalink, and an inferred-row disclaimer where `source = 'inferred'`. Add a **winner badge** to the screenshot gallery and to the player's credit line. | api + web | M10.7 |
| **M10.9** | **PSN profile links** on the leaderboard — `https://psnprofiles.com/<psnProfile>`, the same base URL `PsnProfilesTrophySource` already scrapes. `rel="noreferrer"`, external-link affordance. | web | — |
| **M10.10** | **"Como participar" explainers** for the rank system and the marketplace — what the commands are, where they run, what the rules are, and a Discord CTA. Rank: `/trophy` register + how points work. Marketplace: `/marketplace sell`, the 10-ad limit, expiry/bump. | web | — |
| **M10.11** | **"Porque não apareço no ranking?"** — the banlist ask, redesigned. See the decision below. | web | Luis's call |

### The winner trophy

Luis asked for "a concept of winner trophy if that doesn't exist yet". It does
not — and it should **not** be a row in the `trophies` table. That table is
strictly PSN platinum trophies scraped from PSNProfiles and summed into the
leaderboard by `points`; injecting a synthetic community award would corrupt
the one number `/trophy rank` and the portal leaderboard both promise is "your
real PSN haul".

The winner trophy is therefore a **badge derived from `ScreenshotWinner`**, not
a stored trophy: "🏆 Vencedor da semana" on the shot, and "🏆 ×N" beside a
player's name once they have won more than once. Same visible outcome, no
contamination of the trophy ledger. Rendered with the mark's yellow
(`#FFFD54`) as a border/fill, never as body text — the palette rule from
`brand/README.md` and `portal/web/src/lib/platforms.ts`.

## Decisions that are Luis's, not an agent's

### 1. How much of a player's identity goes on a public web page

Crediting the player is the point of item 3, but it moves a Discord display
name from a members-only server onto an indexable public page. That is new
personal data processing, and M9.7's opt-out is **opt-out**, not consent.

Three options, in increasing exposure:

| | Shows | Notes |
| - | ----- | ----- |
| **A** | Permalink only, no name | Zero new personal data; the credit is "click through to Discord to see who". Weakest on Luis's actual goal. |
| **B** | Display name + permalink | **Recommended.** The name is already attached to the post inside a ~public community, and the permalink makes the attribution verifiable rather than a claim the portal invents. Honours the existing `publicOptOut` filter, which already hides an opted-out author's screenshots entirely. |
| **C** | Display name + avatar + permalink | Avatars mean re-hosting another person's image (cross-cutting rule 3 forbids hot-linking the Discord CDN) for marginal gain. Not recommended. |

Whichever is chosen, the privacy page (`portal/web/src/pages/Privacy.tsx`)
must be updated to say that screenshots are credited by name, and point at
`/privacy opt-out` — that is a hard requirement of doing this at all, not a
nice-to-have.

### 2. The banlist page — recommend **not** publishing one

The data exists (`trophyprofiles.isBanned` / `hasLeft` / `isExcluded`) so the
page is buildable. It should not be built as asked.

A public, named, permanent list of banned members is a pillory: it is
search-indexable, it long outlives whatever caused the ban, most of the flags
mean "left the server" or "PSN profile went private" rather than "misbehaved"
(`TrophiesSyncJob` sets `isExcluded` for all three), and it invites exactly the
kind of public argument the Discord appeal is supposed to contain.

**Recommended instead (M10.11): "Porque é que não apareço no ranking?"** — an
explainer covering every reason a profile stops counting (profile set to
private, left the server, name changed on PSN, excluded by a moderator), each
with what to do about it, and a Discord CTA to appeal. That serves the stated
goal — "people come to discord to cry it over" — and serves the much larger
group whose profile broke for a boring reason, without publishing a shame
list. Aggregate counts ("N perfis excluídos") are fine; names are not.

If Luis wants the named list anyway, that is his call to make and it is
recorded here as such — but it should then be behind the existing admin
auth (`AdminTrophyProfiles.tsx` already shows exactly this, to moderators
only), not public.

### 3. Vote-sync cadence and cost

Refreshing vote counts means one Discord API call per screenshot. 624 rows is
fine as a one-off backfill, but a nightly full re-sync is wasteful and will
eat rate limit. Proposed default: sync the **last 8 weeks** nightly and
everything older only on demand, on the grounds that a 2022 screenshot's
reaction count is not going to move. Cheap to change; noted so the first
implementation doesn't silently pick "all rows, every night".

## Explicitly not in scope

- **No fake data.** No seeded winners, no invented vote counts, no
  placeholder players. Where history is unrecoverable the page says so — the
  standard the current `HallOfFame.tsx` already sets.
- **No change to how the leaderboard is computed.** M10.9 adds a link; the
  numbers stay exactly as `OrmTrophyRepository.queryRankedHunters` produces
  them.
- **No SVG trace of the logo.** M8.1's reasoning stands ("an honest raster
  beats an approximate vector"); M10.1 derives new PNGs from the same source.
