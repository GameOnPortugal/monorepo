# Manual test plan — Game On Portugal

**Purpose**: verify, by hand, that everything the community touches actually
works in production. Written 2026-08-21, after the revival effort took the
queue from 41/93 to 90/93.

This exists because the failure that started all of this was **invisible**:
`/marketplace sell` failed on 100% of invocations for fourteen months and
nobody noticed, because nothing ever exercised it end to end. Automated tests
now cover the layers underneath; this covers the part only a human in Discord
can see.

> **Run this after any release you care about.** It takes about 15 minutes.

## Before you start

| | |
| --- | --- |
| Guild | Game On Portugal (`818108848492773377`) |
| Bot | `GameOnPortugalBot#9387` |
| Portal | https://game-on-portugal.pt (after M8.15 DNS propagates) |
| Media | https://media.game-on-portugal.pt |
| Host | `ssh -p 2224 ezweb@195.201.192.35`, Portainer stack `game-on-portugal` |

Quick health check before touching anything:

```bash
ssh -p 2224 ezweb@195.201.192.35 \
  'docker inspect gop-bot --format "status={{.State.Status}} restarts={{.RestartCount}} health={{.State.Health.Status}}"'
```

Expect `status=running restarts=0 health=healthy`. **A non-zero restart count
is the single most useful early warning** — it is what a crash-loop looks like,
and it is exactly what went unnoticed during the 2026-08-20 outage.

---

## 1. Marketplace — the feature that was most broken

### 1.1 Create a sale listing
`/marketplace sell` — name, price, state, zone, dispatch, (optional) warranty,
description, image.

- [ ] You get an **ephemeral** confirmation with a link to the listing
- [ ] The listing appears in **`📖anuncios`**, not in the channel you typed in
- [ ] The embed is **Portuguese**, mint-coloured, with the item image
- [ ] The **ad ID is in the footer**
- [ ] Three buttons: `💬 Contactar`, `✅ Marcar vendido`, `🔄 Renovar`

> **Why this matters**: for fourteen months this command saved the ad, then
> threw on the message-ID write-back and replied twice, burying the real error.
> 28 of 33 ads created after the rewrite carry an empty `message_id`.

If you attached an image, check its URL: it must be on
`media.game-on-portugal.pt`, **never** `cdn.discordapp.com`. A Discord CDN link
dies within 24h — that is what killed the screenshot gallery.

### 1.2 Wanted listing
`/marketplace wanted` — [ ] posts to the same channel, **blue** embed, distinct copy.

### 1.3 Browse
- [ ] `/marketplace list` — ephemeral, paginated, Prev/Next work, links open the real message
- [ ] `/marketplace search` with a keyword — filters correctly
- [ ] `/marketplace search` with nonsense — returns an empty result, not an error
- [ ] Click **Next**, wait 15+ minutes, click again → expect a polite *"search expired, run it again"*, **not** stale results

### 1.4 Lifecycle
- [ ] `/marketplace bump` — reposts the listing
- [ ] `/marketplace bump` again immediately → refused (72h cooldown)
- [ ] `/marketplace edit` — opens a **modal**; saving re-renders the posted message in place
- [ ] `/marketplace sold` — marks sold, message removed
- [ ] `/marketplace delete` — the `id` option **autocompletes to your own ads**; you should never type a UUID

> Autocomplete replaced a positional index (`delete 2`) that resolved against a
> *fresh* query — so an ad created or expired in between deleted the wrong row.

### 1.5 Permissions
- [ ] A non-owner pressing `✅ Marcar vendido` on someone else's ad → refused
- [ ] A moderator (`ManageMessages`) pressing it → allowed
- [ ] Post 10 active ads, try an 11th → refused with a clear pt-PT message

---

## 2. Screenshots

- [ ] `/screenshot create` with an image → confirmation, appears in the gallery
- [ ] Its URL is on `media.game-on-portugal.pt` (re-hosted at submit time)
- [ ] `/screenshot list` → your screenshots
- [ ] `/screenshot delete` → `id` **autocompletes to your own**
- [ ] Deleting someone else's → refused

---

## 3. Trophies

- [ ] `/trophy create` with a PSNProfiles URL — try **both** URL shapes
- [ ] `/trophy check` — shows your profile and **live rank**
- [ ] `/trophy rank` — leaderboard with the guild's plat/gold/silver/bronze emojis on 1/2/3
- [ ] Pagination buttons page forward and back
- [ ] Page past the end → clamps, does not error or render empty

> Sanity check: the true #1 is **`Zephyr-pt`, 58,050 points, 193 trophies**. The
> old broken query showed an arbitrary ten profiles and did not include the real
> leader at all.

---

## 4. Portal — https://game-on-portugal.pt

- [ ] Home loads, stats are real (~9 active ads, 624 screenshots, 4,971 trophies, 118 profiles)
- [ ] Marketplace grid, filters, detail page
- [ ] Screenshots gallery — **grid tiles load thumbnails, not full images**
- [ ] Trophies leaderboard matches `/trophy rank`
- [ ] Mobile at 375px — this is the primary target, not desktop
- [ ] A broken image degrades gracefully (2 of 624 are dead 2022 Discord links)

Thumbnail spot-check — the tile should be a few KB, not a few hundred:
```bash
curl -sI "https://game-on-portugal.pt/api/media/thumbnail?src=<image-url>&w=320" | grep -i content-length
```

### Admin (needs `ManageMessages`)
- [ ] `/admin` → Discord OAuth → back to the portal
- [ ] A non-member is refused; a member without `ManageMessages` is refused
- [ ] Jobs page shows real `job_runs` rows
- [ ] A destructive admin action appears in the **audit log**

---

## 5. Scheduled jobs

Jobs run on cron. Check the record rather than waiting:

```bash
ssh -p 2224 ezweb@195.201.192.35 \
  'docker exec gop-db sh -c "mariadb -uroot -p\$MARIADB_ROOT_PASSWORD -B discord-bot \
   -e \"SELECT job_name,last_run_at,status FROM job_runs ORDER BY last_run_at DESC\""'
```

| job | schedule | |
| --- | --- | --- |
| `ads-reconcile` | daily 03:00 | [ ] recent, `success` |
| `ads-lifecycle` | daily 10:00 | [ ] recent, `success` |
| `screenshots-relink` | Sat 22:00 | [ ] `success` |
| `week-screenshot-winner` | Sun 23:50 | [ ] `success` |
| `trophies:sync` | every 10 min | **opt-in**; not scheduled unless `TROPHIES_SYNC_ENABLED=true` |

- [ ] **Every row reads `success`.** A `failed` row that nobody clears is how a
      broken job hides — `week-screenshot-winner` sat `failed` for a day after
      it had actually been fixed, because it only runs on Sundays.

Any job can be dry-run safely:
```bash
docker exec gop-bot sh -c "cd /app && bun run:command jobs:run <job-name> --dry-run"
```

---

## 6. Things that should NOT happen

- [ ] Naming an item `@everyone` does **not** ping the server
- [ ] An error reply is **ephemeral**, never public
- [ ] No command ever shows *"This application did not respond"*
- [ ] Typing in an autocomplete field never leaves the box spinning forever

---

## If something is wrong

1. `docker logs gop-bot --since 10m` on the host — errors go through the logger
2. Check `RestartCount`; non-zero means crash-looping
3. Deploys fail loudly now: the pipeline samples each container twice and fails
   if it is not running or if `RestartCount` moved
4. Rollback is a Portainer redeploy of the previous image tag

Report anything you find in `docs/known-issues.md` rather than only in Discord —
the reason this project accumulated fourteen months of breakage is that nothing
was ever written down.
