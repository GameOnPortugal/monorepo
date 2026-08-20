# Plan 04 — Infrastructure migration: TedRelayer → HTZ1

**Status: phases 0–3 done, 2026-08-19. Production runs on HTZ1.** Phases 4
(public DNS cutover) and 5 (TedRelayer decommission, due 2026-09-02) remain —
see [`GLOBAL-PLAN.md`](GLOBAL-PLAN.md) items M8.15 and the decommission
follow-up. This document is kept as the executed runbook plus what is left,
not rewritten into a retrospective — see `docs/operations.md` for the
day-to-day operational picture.

**Goal**: move the live stack off the home server onto HTZ1, behind the same
Portainer + Caddy + GitHub Actions pipeline as every other project, with
release-please cutting releases on merge.

The repo-side work of this plan was done first — see "What is already
built" — then phases 0–3 below were executed against real credentials,
production access and DNS on 2026-08-19.

## Why

Production currently runs on **TedRelayer**, the home media server, as a
hand-managed docker-compose stack that CI cannot reach. That means: no automated
deploy, community traffic served from a residential connection, the only copy of
the bot token in a single `.env` on a machine also running Plex and Frigate, and
a portal (plan 03) that would inherit all of it.

HTZ1 (`195.201.192.35`) already runs Portainer, a central Caddy, MinIO-based
stacks and the SSH-tunnel deploy pattern. Moving there costs one migration and
removes every one of those problems.

## Decisions taken

Recorded here so nobody relitigates them mid-migration.

| Decision | Choice | Why |
| -------- | ------ | --- |
| Host | **HTZ1**, Portainer stack `game-on-portugal` | Where the rest of the estate lives; public, CI-reachable |
| Deploy | **Portainer API over SSH tunnel**, house composite action | Identical to brawl-teams / builders-and-builds / smart-table |
| Runners | **`ubuntu-latest`** | Public repo → free hosted runners; no evidence this org can use the ARC runners |
| Releases | **release-please, per-component, on merge to main** | Auto-versioning; `pr-title.yml` enforces the Conventional Commits it depends on |
| Release auth | **`RELEASE_PLEASE_TOKEN` PAT** | No GitHub App on the GameOnPortugal org; `GITHUB_TOKEN` PRs do not trigger downstream workflows |
| Media | **New MinIO in-stack**, bucket `gop-media`, public-read, served at `media.game-on-portugal.pt` | Discord CDN URLs expire — issue #19. Separate from the HTZ1 MinIO used by insight-report-studio |
| Database | **MariaDB 11.7.2 in-stack**, restored from a logical dump | Matches the version the tests run against |
| Redis | **Dropped** | The rewritten bot never reads `REDIS_DSN`; only the old bot used it |
| Scheduler container | **Retired** (plan 02) | Its CapRover-name workaround is obsolete and it mounts the docker socket |
| Domain | `game-on-portugal.pt` → HTZ1; `media.` subdomain for the bucket | Replaces the 2021 GitHub Pages site |
| Bot downtime | **Accepted**, target < 15 minutes | A community bot at this size does not warrant a dual-write migration |

## What is already built

Committed in this repo, lint-clean (`actionlint`, 0 errors) — this was the
state *before* phases 0–3 executed and made it live:

```
.github/workflows/       ci · docker-build · deploy · release-please
                         pr-title · labeler · security · workflow-failed
.github/actions/         portainer-deploy · send-telegram-message
.github/release-please-config.json + .github/.release-please-manifest.json
.github/labeler.yml
infrastructure/game-on-portugal.yaml        Portainer stack (bot, db, minio, backup)
infrastructure/caddy/game-on-portugal.pt.caddy
infrastructure/SETUP.md                     wiring reference
```

The nine CapRover-era workflows, the root release-please manifest and the old
Telegram action were deleted — they targeted the decommissioned *Superman*.

`discord-bot/package.json` gained a `version` field (release-please's `node`
type requires one) and a `typecheck` script.

## Runbook

### Phase 0 — Before touching anything — ✅ done, 2026-08-19

1. **Dump the production database and verify the dump restores locally.** —
   done. Restored into a throwaway MariaDB 11.5.2 container and row-count
   verified. Backups live at `~/gop-backups/2026-08-19/` on Luis's Mac (not in
   the repo).

   ```bash
   ssh -p 2224 tedcrypto@192.168.0.184 \
     'set -a; . ~/game-on-portugal/.env; set +a;
      docker exec game-on-portugal-db mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" \
        --single-transaction --routines --triggers discord-bot' \
     | gzip > gop-$(date +%F).sql.gz
   ```

   Row counts: **4,971 trophies · 624 screenshots · 118 trophyprofiles · 70
   ads.** Correction: the 4,477 figure quoted everywhere before this migration
   came from `information_schema.tables.table_rows`, which is only an
   *estimate* for InnoDB. `SELECT COUNT(*)` gives 4,971 — the number now in use
   across the docs. Screenshots, trophy profiles and ads were confirmed exact
   either way.

2. **Copy `~/game-on-portugal/.env` into 1Password.** — **still outstanding.**
   It remains the only copy of the *old* bot token and DB credentials, on a
   home server that is no longer production but is still the rollback path
   until 2026-09-02.

3. **Check the existing `databack/mysql-backup` output is real.** — done, and
   it was **not** real: the nightly dump had been failing to *upload* for seven
   weeks (last file on the NAS was 2026-06-30, the day of the Superman→TedRelayer
   migration). The dump itself succeeded every night; the SMB upload failed with
   `protocol negotiation failed: NT_STATUS_CONNECTION_DISCONNECTED` because
   `DB_DUMP_TARGET` addressed the NAS over the internet via the DDNS name
   `joshlopes.synology.me` instead of the LAN address `192.168.0.178` (TedRelayer
   and the NAS are on the same LAN). Fixed by repointing and recreating the
   container; a backup was produced immediately and verified on the NAS.
   Logged as a fixed defect in [`known-issues.md`](../known-issues.md). **General
   lesson**: the backup had never once been checked, and "the container is Up"
   was not evidence it was working — worth remembering for `gop-db-backup` on
   HTZ1 too.

### Phase 1 — Repo wiring (no production impact) — ✅ done, 2026-08-19

4. Repo settings: squash-merge only, branch protection requiring `CI`. — done.
5. Create `PORTAINER_ACCESS_TOKEN`, `DEPLOY_SSH_KEY`, `DEPLOY_SSH_KNOWN_HOSTS`
   secrets, and `DEPLOY_SSH_HOST` / `DEPLOY_SSH_USER` / `DEPLOY_SSH_PORT` /
   `PORTAINER_ENDPOINT_ID` / `PORTAINER_STACK_ID` variables. — done, values in
   `infrastructure/SETUP.md`. `DOCKER_USERNAME` / `DOCKER_PASSWORD` /
   `MY_RELEASE_PLEASE_TOKEN` were pre-existing and kept.

   **Not done**: `RELEASE_PLEASE_TOKEN` (a fine-grained PAT) — it cannot be
   minted non-interactively. `release-please.yml` falls back to
   `GITHUB_TOKEN`, which works but means the release PR itself gets no CI run.
   Also not done: `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` /
   `TELEGRAM_THREAD_ID` (optional — notifications skip silently while unset).
6. Delete the obsolete `CAPROVER_DISCORD_BOT_APP`, `CAPROVER_DISCORD_BOT_TOKEN`,
   `CAPROVER_SCHEDULER_APP`, `CAPROVER_SCHEDULER_TOKEN`, `CAPROVER_SERVER`
   secrets. — done. `MY_RELEASE_PLEASE_TOKEN` was left in place (not read by
   any current workflow, but not obviously safe to delete either) rather than
   deleted.
7. Merge this branch. Expect: `CI` runs and `release-please` opens a release PR.
   `deploy.yml` was gated to `workflow_dispatch` only until phase 3 step 19 —
   see that step for re-enabling the `push` trigger, which has now happened.

### Phase 2 — HTZ1 preparation (no cutover) — ✅ done, 2026-08-19

8. Generate a deploy keypair; **append** the restricted line to
   `~ezweb/.ssh/authorized_keys` on HTZ1 (back up and diff the file — it holds
   one line per project). Set `DEPLOY_SSH_KEY` / `DEPLOY_SSH_KNOWN_HOSTS`. —
   done; backup at `~/.ssh/authorized_keys.bak-2026-08-19` on HTZ1, diff
   confirmed exactly one line added.
9. Set the `DEPLOY_SSH_*` and `PORTAINER_ENDPOINT_ID` variables. — done
   (`DEPLOY_SSH_PORT=2224`, `PORTAINER_ENDPOINT_ID=3` — see resolved open item
   below).
10. `docker network create proxy` if absent. — already existed on HTZ1, shared
    with the other stacks.
11. Create the Portainer stack from `infrastructure/game-on-portugal.yaml` with
    **a placeholder `DISCORD_TOKEN`** so the bot cannot connect and fight the
    live one for slash commands. Record `PORTAINER_STACK_ID`. — done, **stack
    id 46**, endpoint 3.
12. Restore the phase-0 dump into `gop-db`. Re-verify row counts. — done,
    counts matched.
13. Add only the `media.game-on-portugal.pt` DNS record and Caddy vhost; confirm
    the bucket serves a test object publicly. — done. OVH record id
    `5429963149`, TTL 300; zone backed up to `~/ovh-zone-backups/2026-08-19/`
    first, then refreshed. Caddy block appended to the host's central
    `/opt/caddy/Caddyfile` (backup at `~ezweb/caddy-backups/` — `ezweb` can
    *write* the Caddyfile via the `caddy-editors` group but cannot create new
    files directly in `/opt/caddy/`), validated and reloaded. Verified end to
    end: an uploaded object is served at
    `https://media.game-on-portugal.pt/gop-media/<key>` over Caddy TLS.

### Phase 3 — Cutover (the ~15 minutes of downtime) — ✅ done, 2026-08-19, ~2 minutes actual downtime

14. Announce a short maintenance window in the guild. — done.
15. On TedRelayer: `docker compose stop game-on-portugal-app` — **the old bot
    must be down before the new one comes up.** Two bots on one token will both
    receive interactions and double-reply. — done. First confirmed the image
    HTZ1 pulled and the image TedRelayer was running were the **same build**
    (both `2025-06-30T08:36:26Z`), so the cutover did not change the running
    code.
16. Take a final delta dump and restore it into `gop-db`. — done.
17. Set the real `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` in the Portainer stack env
    and redeploy. — done.
18. Verify: `docker logs gop-bot` shows `Ready! Logged in as
    GameOnPortugalBot#9387`; run `/ping` in the guild. — done. 4 slash commands
    registered, `No pending migrations to apply`, `RestartCount=0`.
19. **Re-enable `deploy.yml`'s `push` trigger** (uncomment the block at the top
    of the file), then push a trivial commit and confirm the pipeline deploys
    end to end. — done in this PR.

TedRelayer's `game-on-portugal-app` and `game-on-portugal-scheduler` are
**stopped but intact** (note: the `scheduler/` directory was deleted from the
repo 2026-08-19 and is no longer maintained); `game-on-portugal-{db,redis,db-backup}` are still
running. They stay that way until phase 5 (**2026-09-02**) as the rollback
path:

```
# Rollback = stop gop-bot on HTZ1, then on TedRelayer:
cd ~/game-on-portugal && docker compose start game-on-portugal-app
```

Known issue #11 (the DB root password printed in plaintext on boot) is
unchanged by this migration — still open, still `M0.7`.

### Phase 4 — Public cutover (only once plan 03 has a portal) — remaining, = GLOBAL-PLAN M8.15

20. Point the `game-on-portugal.pt` apex and `www` at HTZ1 in the OVH zone, and
    **refresh the zone** — OVH applies the zone, not the individual record.
21. Add the apex Caddy block; reload Caddy.
22. Archive `GameOnPortugal/gameonportugal.github.io` and delete this repo's
    orphaned `webpage/` directory (issue #9).

Steps 20–22 are independent of 14–19 and should not be bundled with them. They
were deliberately **not** done as part of this cutover — the apex still serves
the 2021 GitHub Pages site, on purpose, until the portal exists.

### Phase 5 — Decommission — remaining, due 2026-09-02

23. Leave the TedRelayer stack **stopped but intact** for at least two weeks.
    In progress: `game-on-portugal-app` and `game-on-portugal-scheduler` were
    stopped at cutover (2026-08-19); the `scheduler/` directory was deleted from
    the repo 2026-08-19 and is no longer maintained; `game-on-portugal-{db,redis,db-backup}`
    are still running as of this doc. Two weeks from cutover is **2026-09-02**.
24. Then remove it, keeping one final dump in 1Password/NAS.
25. Update `docs/operations.md`, `AGENT.md` and `remote-hosts.md`. — the first
    two were done as part of the cutover PR; re-check both once phase 5
    actually removes the TedRelayer stack, since the "rollback path" sections
    they gained will need deleting at that point.

## Rollback

Before step 20 rollback is cheap: stop `gop-bot` on HTZ1, then `docker compose
start game-on-portugal-app` on TedRelayer. The old stack stays untouched until
phase 5, so the fallback is always one command. Data written to HTZ1 after
cutover would be lost on rollback — a delta dump in the other direction is the
mitigation if the window has been long.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Two bots live on one token | Phase 3 step 15 — stop the old one *first* |
| Migration loses data | Verified dump in phase 0; delta dump at cutover; old stack kept |
| Portainer stack fails on a missing image | Portal services are commented out of the stack file until their images exist |
| A missing secret boots a silent bot | Stack file uses `${VAR:?…}` for `DISCORD_TOKEN`, so the deploy fails loudly instead |
| DB root password leaks to logs | Issue #11 — fix `entrypoint.sh` before enabling `LOKI_HOST` |
| Deploy key over-scoped | Restricted `permitopen=127.0.0.1:9000`, forced command, no shell |
| `authorized_keys` clobbered | Append only; back up and diff |

## Open items

- **`DEPLOY_SSH_PORT`** — ✅ resolved. `2224`, confirmed by a working tunnel
  during phase 2. The ez-web SETUP drafts claiming `22` are wrong.
- **ARC runners** — still open, low stakes. Could not query whether the
  GameOnPortugal org can use them (needs `admin:org`). `ubuntu-latest` is free
  for a public repo, so this is a preference, not a blocker.
- **MinIO console** exposure — ✅ resolved. Decided: **not exposed**. Only the
  public `gop-media` bucket (S3 API, read-only for objects) is reachable from
  the internet.

## Still outstanding after this migration

- `RELEASE_PLEASE_TOKEN` (fine-grained PAT) — could not be minted
  non-interactively. `release-please.yml` falls back to `GITHUB_TOKEN`, so the
  release PR itself gets no CI run.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `TELEGRAM_THREAD_ID` — optional,
  notifications skip silently while unset.
- Copying the bot token into 1Password (see phase 0, step 2).
- Phase 4 (public DNS cutover) and phase 5 (TedRelayer decommission, due
  2026-09-02) — see those sections above.
