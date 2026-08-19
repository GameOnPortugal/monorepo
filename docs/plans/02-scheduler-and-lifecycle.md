# Plan 02 — Scheduler, ad lifecycle, and screenshot recovery

**Goal**: get scheduled work running again, give ads a real lifecycle (the
"re-bump" flow), and recover 624 screenshots that currently point at dead images.

Read [`00-overview.md`](00-overview.md) first.

## Why the scheduler is dead

Not a crash — a stale image. `docker exec game-on-portugal-scheduler cat
/srv/config.ini` shows **every job commented out**, including a
`weekly-screenshot-winner` still calling the old bot's
`node scripts/screenshot-winners.js`. The repo enabled the bun-based job in
commit `c28a73f` (2025-04-20 09:56); `joshlopes/game-on-portugal-scheduler:latest`
was last pushed **2025-04-19 14:27**, seventeen hours earlier, and was never
rebuilt.

So the container has run zero jobs since deployment. Its logs contain nothing but
the `update-container-id` supervisord loop firing every two minutes.

**And fixing that alone would not help**, because of the next section.

## The weekly winner would find nothing even if it ran

`CreateScreenshotSubcommand` persists the screenshot *before* replying, and
passes `interaction.id` as the message ID:

```ts
await this.commandHandlerManager.handle(new CreateScreenshot(
    screenshotId, name, interaction.user.id,
    interaction.channelId,
    interaction.id,          // ← the interaction's snowflake, not the message's
    platform, image.url,     // ← a signed CDN URL that expires within 24h
));
```

`GetScreenshotWinnerHandler` then calls
`guildClient.getTotalReactionsByEmoji(SCREENSHOTS, screenshot.messageId, …)`,
which fetches a message that does not exist → `ClientError` → caught, logged,
`continue` → `winner` stays `null` → *"No winner found"*, every week, forever.

Verified against production: stored `message_id` `1511065198885212340` does not
resolve; the actual message is `1511065203364860014` (same millisecond, hence the
resemblance).

**The good news** — everything needed to repair this exists:

- The real messages are in `🖼screenshots` with their attachments intact.
- They carry `plat` reactions with real counts (samples: 4, 2, 4, 3, 3).
- Their content embeds the screenshot UUID: `ID: #019e8451-dbe7-7391-…`, so
  matching a message to a row is **deterministic**, not heuristic.
- The trophy emoji IDs hardcoded in `DiscordEmoji.ts` are correct.

## Decision: replace the scheduler container with in-process cron

The current design is a Chadburn binary plus supervisord plus a Python script
(`update_container.py`) that rewrites `config.ini` at runtime to discover the bot
container's name — an indirection that existed **only because CapRover generated
suffixed container names**. Production is now plain docker-compose with a fixed
`container_name: game-on-portugal-app`. The entire mechanism is solving a problem
that no longer exists.

It also mounts `/var/run/docker.sock` into a container, on a home server that
also runs Plex, Frigate and Home Assistant. That is root-equivalent access to the
host, for a cron job.

**Recommendation**: delete the `scheduler/` service and run jobs inside the bot
process, with the existing `bin/console.ts` commands kept as the manual entry
point.

- Removes a container, a Python dependency, supervisord, and the docker.sock
  mount.
- Jobs become testable in the existing integration-test harness.
- Failures surface in the bot's own logger (and Loki, when enabled).

Cost: jobs stop if the bot is down — acceptable, since a job that acts on Discord
is useless while the bot is down anyway. Add a startup catch-up check for missed
runs rather than assuming perfect uptime.

> **Alternative**: keep Chadburn but declare jobs as compose **labels**
> (`chadburn.job-exec.…`), deleting `config.ini`, `update_container.py`,
> `supervisord.conf` and `requirements.txt`. Retains the docker.sock mount.
> Choose this only if Luis wants jobs runnable while the bot is unhealthy.

Either way: **verify inside the container after deploying**, not in the repo.
Trusting the repo is exactly how this went unnoticed for sixteen months.

## Jobs

| Job | Schedule | Purpose |
| --- | -------- | ------- |
| `screenshots:relink`  | one-off, then weekly | Repair `message_id`, re-host images |
| `screenshots:winner`  | Sun 23:50 | The weekly winner announcement |
| `ads:lifecycle`       | daily 10:00 | Bump prompts and expiry |
| `ads:reconcile`       | daily 03:00 | Detect ads whose message vanished |
| `trophies:sync`       | later | Out of scope — needs the psnprofiles port |

Every job: structured start/finish logs with counts, a `--dry-run` flag, and a
bounded work limit per run.

### `screenshots:relink` — the recovery job

1. Page backwards through `🖼screenshots` history (`GET /channels/{id}/messages`,
   100 at a time, `before` cursor).
2. For each bot message, extract the UUID from `ID: #<uuid>` in the content.
3. Match to the `screenshots` row; update `message_id` to the **real** message ID.
4. Download the message's current attachment (a freshly-signed, working URL) and
   re-host it; store the durable URL in `image`.
5. Report: matched, unmatched-rows, unmatched-messages.

Idempotent — safe to re-run. Rate-limit-aware (Discord allows ~50 req/s globally;
stay well under and honour `X-RateLimit-Remaining`).

**Where to re-host** is a shared decision with plan 03 — see its "Media storage"
section. Do not settle it unilaterally; the portal has to serve these.

Also fix the source of the bug: capture the posted message's ID and re-host at
submit time, so new screenshots never enter this state.

### `screenshots:winner`

Only unblocked once `relink` has run. Changes needed:

- Default to **dry-run for the first production run** and post the result to an
  admin channel for eyeballing before it goes public.
- Handle ties (currently first-wins by iteration order — make it explicit).
- Skip screenshots whose message no longer exists rather than logging an error
  per row.
- Confirm the `!give-xp <user> 1000` line still targets a bot that exists; if
  not, drop it.

### `ads:lifecycle` — the re-bump flow

The old bot's version (`old-discord-bot/scripts/has-been-sold.js`) is the
behavioural spec, and it is worth reading. Summary: ads older than a week → DM
the owner an embed with ✅/❌ → sell+✅ = sold, delete; sell+❌ = renew (repost);
**no answer within 3 hours = delete**; DM fails = delete; then recurse into that
user's other old ads.

Keep the shape, fix the cruelty and the data loss:

| Old behaviour | New behaviour | Why |
| ------------- | ------------- | --- |
| Nags at 7 days | Prompt at **14 days** idle | 7 days is noisy for slow-moving items |
| 3 hours to reply | **72 hours** | 3h assumes people read DMs immediately |
| Silence → **delete row** | Silence → `status='expired'`, message removed, row kept | Deleting is unrecoverable and hostile |
| DM fails → **delete row** | Mark `expired`, log it | Closed DMs are not consent to delete |
| Renew = new row + delete old | Renew = **same row**, new `message_id`, `bumped_at` updated | Old way destroyed ad identity and history |
| Reactions ✅/❌ | **Buttons** (plan 01's `ButtonHandler`) | Reactions on DMs are clunky on mobile |
| Recurses into all the user's ads | One DM listing **all** their expiring ads | The recursion could DM-spam |

Renewal should genuinely bump — delete the old channel message and post a fresh
one, so the listing returns to the bottom of `📖anuncios`, which is the entire
point of a bump. Keep the same `AdId`; only `message_id` changes.

Expired ads stay visible in `/marketplace list` with their status and can be
relisted with `/marketplace bump`.

### `ads:reconcile`

Walk active ads, check the message still exists, mark `status='expired'` where it
does not. Catches manual moderator deletions and the orphan case from plan 01's
post-then-persist flow (message posted, row write failed → an ad message with no
row; log it for manual cleanup).

## Task breakdown

| # | Task | Acceptance |
| - | ---- | ---------- |
| 1 | **Decide and implement the runner** (in-process cron vs Chadburn labels). Keep `bin/console.ts` commands working. | A job runs on schedule in a local container; `bun run:command …` still works |
| 2 | **Fix screenshot capture at source**: store the posted message's ID, re-host the image at submit time. | A new `/screenshot create` yields a row whose `message_id` resolves and whose `image` URL still works a week later |
| 3 | **`screenshots:relink`** recovery job. | ≥90% of the 624 rows get a resolvable `message_id` and a live image; run reported honestly, unmatched rows listed |
| 4 | **Unblock and harden `screenshots:winner`.** | Dry run on real data names a plausible winner with a real reaction count |
| 5 | **`ads:lifecycle`.** Depends on plan 01 tasks 4 + 6 (status columns, buttons). | Integration test covers: prompt sent, renew bumps in place, silence expires without deleting |
| 6 | **`ads:reconcile`.** | Detects a manually-deleted ad message and marks the row |
| 7 | **Retire `scheduler/`** (or reduce it to labels). Update compose, `AGENT.md`, `docs/operations.md`. | Production runs one fewer container; no docker.sock mount |
| 8 | **Job observability**: per-run summary to an admin channel. | A failed run is visible without SSH |

## Deployment reminder

CI cannot deploy (issue #2). After merging, build and push the image, then on
TedRelayer: `cd ~/game-on-portugal && docker compose pull && docker compose up -d`.
Then verify **inside the container** that the job list is what you expect.

## Decisions (settled — do not relitigate)

1. **In-process cron.** Delete the `scheduler/` service entirely; run jobs inside
   the bot, keeping `bin/console.ts` as the manual entry point. This removes a
   container, supervisord, a Python dependency and — most importantly — a
   `/var/run/docker.sock` mount from a host that also runs Plex, Frigate and
   Home Assistant.
2. **Re-hosted images go to MinIO**, a new in-stack instance on HTZ1, bucket
   `gop-media`, public-read, served at `https://media.game-on-portugal.pt`.
   Defined in `infrastructure/game-on-portugal.yaml`; the bot reads
   `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` /
   `S3_PUBLIC_URL`. Store the public URL in the database, never a presigned one.
3. **Timings**: 14 days idle → prompt, 72h to respond, 30-day expiry, expire
   rather than delete.
4. **`ads:lifecycle` marks the 28 legacy ads `expired` on its first run.** No
   heuristic backfill of their message IDs (see plan 01, decision 1).
5. **Drop the `!give-xp` line** from the winner announcement unless someone
   confirms the receiving bot still exists — a public message invoking a
   non-existent command is worse than no message.
6. **Order matters**: the deployment migration (plan 04) should land before the
   `screenshots:relink` backfill, so the recovered images are written straight to
   the MinIO that will still exist afterwards, rather than to TedRelayer twice.
