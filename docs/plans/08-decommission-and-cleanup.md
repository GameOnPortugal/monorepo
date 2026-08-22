# Plan 08 — Decommission & cleanup

**Goal**: retire everything the revival replaced, without removing a rollback
path before it has earned retiring.

Written 2026-08-21, from an audit of the live hosts and the repo rather than
from memory. Every item below states what was *verified*, not what was assumed.

> **The ordering rule for this whole plan**: nothing that is currently a
> rollback path gets deleted until the thing replacing it has run unattended
> for long enough to trust. That is why C1 is dated and not merely "todo".

---

## Already done — do not redo

| | Verified 2026-08-21 |
| --- | --- |
| `old-discord-bot/` | **Deleted** (#44, M9.6). Not present in the tree. |
| Seven dead Prisma models | **Dropped** (migration `20260820102655_drop_dead_models`) — 4 LFG + `StockUrls` + `CommandChannelLink` + `SpecialChannel` |
| Dead env vars | `SENTRY_DSN`, `REDIS_DSN`, `TROPHY_WEBHOOK`, `TELEGRAM_ACCESS_TOKEN` gone from `.env.example` and the compose files |
| Dependabot alerts | **76 → 0**. Every one lived in `old-discord-bot/package-lock.json`. |

### ⚠️ Do NOT remove: `old-discord-bot` mentions in `discord-bot/src`

A grep still finds the string in ~6 source files. **These are provenance
comments, not leftovers** — e.g.

```
* Ported from `old-discord-bot/src/service/trophy/psnCrawlService.js#getPsnProfileByUrl`
```

They record *why* a piece of logic looks the way it does, and the code they
point at is still in git history. Stripping them to make a grep clean would
delete the only explanation of some genuinely non-obvious behaviour (the
Monday→Sunday week window, the points ladder, the `sell`/`sale` adType split).
Leave them.

---

## C1 — Decommission TedRelayer (M2.5) — **due 2026-09-02, not before**

TedRelayer (`ssh -p 2224 tedcrypto@192.168.0.184`) is the pre-HTZ1 home for the
bot. It is **stopped-but-intact on purpose**: it is the rollback path.

Audited 2026-08-21:

| container | state | note |
| --- | --- | --- |
| `game-on-portugal-app` | Exited (137), 47h | the old bot — already stopped |
| `game-on-portugal-scheduler` | Exited (137), 47h | old cron sidecar |
| `game-on-portugal-db` | **Up 7 weeks (healthy)** | MariaDB 11.5.2 — the rollback data |
| `game-on-portugal-redis` | **Up 7 weeks** | Keyv cache; nothing reads it now |
| `game-on-portugal-db-backup` | **Up 47 hours** | still dumping the frozen DB |

Volumes: `game-on-portugal_gop-db-data`, `_gop-redis-data`, `_gop-backup`.
Stale images: `joshlopes/game-on-portugal-bot` (411 MB, 13 months old),
`joshlopes/game-on-portugal-scheduler` (116 MB, 16 months old).

**Steps, in order, on or after 2026-09-02:**

1. **Take a final dump of the old database and put it somewhere durable** —
   not on TedRelayer. This is the only irreversible step; do it first and
   verify the file is readable before touching anything else.
   > The nightly backup silently failed for **seven weeks** in 2026 because the
   > dump succeeded and the SMB *upload* failed against a DDNS name. "The
   > backup container is Up" is not evidence a backup exists. Open the file.
2. Confirm HTZ1 has been serving without incident since the cutover, and that
   `job_runs` shows recent successful runs.
3. Stop `game-on-portugal-redis` and `game-on-portugal-db-backup`. Nothing
   reads Redis; the backup job is dumping a database nobody writes to.
4. Stop `game-on-portugal-db`.
5. Wait a further week with everything stopped but volumes intact.
6. Remove the containers, then the three volumes, then the two stale images.
7. Delete the old stack definition and any `.env` on that host.

**Do not skip step 5.** Stopping is reversible; `docker volume rm` is not.

---

## C2 — Delete `webpage/` (part of M8.15) — ✅ **DONE 2026-08-21**

`webpage/` was a 111-file Bootstrap template copy of the old site, **deployed by
nothing** (`docs/known-issues.md` #9), whose `index.html` referenced an
`assets/img/logo.png` that did not exist.

Unblocked and done on the same day as C3, once the apex cutover was verified:
`game-on-portugal.pt` and `www` both resolve to `195.201.192.35` (HTZ1) and
serve the portal. Deleted with `git rm -r webpage`; the files remain in history
(`git log -- webpage`).

Every file that referenced it was updated in the same PR:

- `.github/labeler.yml` — the `Legacy` label's only glob was `webpage/**`
  (`old-discord-bot/**` had already gone in M9.6), so the whole label went. The
  label itself still exists on GitHub; it is simply never applied now.
- `.github/workflows/security.yml` — the Trivy `skip-dirs: webpage` exclusion
  and its comment. Trivy now scans the whole tree with nothing excluded.
- `AGENT.md` — the repo table (which also still listed the long-deleted
  `old-discord-bot/` and omitted `portal/`) and the "Where it lives" note
- `docs/README.md`, `docs/plans/00-overview.md`, `docs/known-issues.md` #9
  (marked resolved), `docs/state-of-the-project.md`, `docs/plans/03-portal.md`,
  `docs/plans/04-infrastructure-migration.md` (phase 4 closed),
  `docs/revival-plan.md` item 24
- `brand/README.md` — rewritten as past tense; the point it made still stands

**Not touched**: `docs/plans/GLOBAL-PLAN.md`, because PR #71 was open against it
at the time. Its M8.15 row still says these three follow-ups are "still open,
now unblocked" — that line needs a one-word update once both PRs land.

---

## C3 — Archive `GameOnPortugal/gameonportugal.github.io` — ✅ **DONE 2026-08-21**

Archived (`PATCH /repos/… archived=true`), not deleted — it is the provenance of
the old site, last pushed 2021-11-11. Its Pages site is left configured with the
`game-on-portugal.pt` CNAME; that is inert now that DNS points elsewhere, and
archiving freezes it.

The `_github-pages-challenge-gameonportugal` TXT record was then removed from
the OVH zone (record id `5215290515`) and the zone refreshed — OVH publishes the
zone, not the individual record. The zone was snapshotted first to
`~/ovh-zone-backups/2026-08-21/game-on-portugal.pt.json`. MX, SRV, `autoconfig`,
`discord`, `media` and `www` were untouched.

> **Gotcha worth not relearning: OVH's nameservers front a cache, and a delete
> waits out the record's own TTL.** The API showed the record gone and the zone
> `isDeployed: true` within seconds, and `/domain/zone/…/export` no longer
> listed it — but `dig` against both authoritative IPs (`5.135.112.57`,
> `5.39.116.25`) kept returning the old value for **~60 minutes**, which is
> exactly the zone's default TTL of 3600s. The served SOA serial had already
> advanced to the new zone by then, so the serial is *not* a reliable signal
> that a specific record has cleared — the answer for that one name outlives it.
> Nothing was wrong and no second refresh was needed; the first one worked.
> Check `/domain/zone/…/export` for the truth and wait out the TTL rather than
> re-refreshing and wondering.

**The stated ordering rule was consciously overridden here.** This plan said to
keep the TXT record "until you are certain you will not roll back to Pages,
because re-verifying a domain there is slower than leaving one stale TXT record
in place." Luis's call, 2026-08-21: *"I can't see myself going back."* So the
cost is known and accepted — a rollback to Pages now means unarchiving the repo
**and** re-verifying the domain from scratch, not just repointing DNS.

---

## C4 — Rotate the Discord OAuth client secret

`DISCORD_CLIENT_SECRET` was created on 2026-08-21 and transited a chat
transcript on its way into 1Password. It is one click to reset in the Discord
Developer Portal (application `854400559633268766` → OAuth2 → Reset Secret).

Not urgent — the secret only grants the OAuth flow for this one application,
and the admin surface is behind a `ManageMessages` check regardless — but it is
cheap hygiene once the portal is confirmed working end to end. Update the
1Password item and the Portainer stack env together; rotating one without the
other logs every admin out with a confusing error.

---

## C5 — Smaller leftovers

- **`.env.example` drift** — re-read it against what `src/Infrastructure/Config/env.ts`
  actually validates. It has drifted in both directions before (advertising dead
  vars, omitting live ones).
- **The audit-log volume is not backed up.** `portal_audit_data` holds M8.11's
  SQLite audit log. The nightly job dumps MySQL only, so the audit log survives
  redeploys but not disk loss. Either add it to the backup or write down that it
  is deliberately ephemeral.
- **`deepmerge-ts` override** (`discord-bot/package.json`) — added to clear a
  high advisory Prisma 7 pulls through `@prisma/config`. Remove it once
  `@prisma/config` widens its range; the reason is in the M3.6 row.
- **Two unrecoverable screenshots** — 2022-era rows whose Discord CDN
  attachments no longer exist. `screenshots-relink` will reconsider them on
  every run forever. Harmless, but if it ever bothers anyone, mark them rather
  than letting the job retry indefinitely.

---

## What this plan deliberately does not do

**It does not delete anything on the strength of "it looks unused."** Every
item above names how its disuse was verified — a container state, a grep, a
row count, an archive flag. The one time this project deleted on assumption
(the scheduler pointing at `node scripts/…` commands that did not exist), the
result was a scheduler that ran zero jobs for sixteen months without anyone
noticing.
