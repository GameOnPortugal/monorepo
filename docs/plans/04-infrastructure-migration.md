# Plan 04 — Infrastructure migration: TedRelayer → HTZ1

**Goal**: move the live stack off the home server onto HTZ1, behind the same
Portainer + Caddy + GitHub Actions pipeline as every other project, with
release-please cutting releases on merge.

The repo-side work of this plan is **already done** — see "What is already
built". What remains needs credentials, production access and DNS, so it is
written as a runbook rather than a coding task.

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

Committed in this repo, lint-clean (`actionlint`, 0 errors), nothing live:

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

### Phase 0 — Before touching anything

1. **Dump the production database and verify the dump restores locally.**

   ```bash
   ssh -p 2224 tedcrypto@192.168.0.184 \
     'set -a; . ~/game-on-portugal/.env; set +a;
      docker exec game-on-portugal-db mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" \
        --single-transaction --routines --triggers discord-bot' \
     | gzip > gop-$(date +%F).sql.gz
   ```

   Restore it into a throwaway MariaDB 11.7.2 and confirm the row counts:
   **4,477 trophies · 624 screenshots · 118 trophyprofiles · 70 ads**.
   Do not proceed until those match.

2. **Copy `~/game-on-portugal/.env` into 1Password.** It is the only copy of the
   bot token and DB credentials, and it lives on a home server.

3. **Check the existing `databack/mysql-backup` output is real** — it has been
   running for seven weeks and nobody has verified it produces a restorable
   dump.

### Phase 1 — Repo wiring (no production impact)

4. Repo settings: squash-merge only, branch protection requiring `CI`.
5. Create `RELEASE_PLEASE_TOKEN`, `DOCKER_*`, `TELEGRAM_*` secrets.
6. Delete the obsolete `CAPROVER_*` secrets and `MY_RELEASE_PLEASE_TOKEN`.
7. Merge this branch. Expect: `CI` runs and `release-please` opens a release PR.
   `deploy.yml` is **already gated to `workflow_dispatch` only** — its `push`
   trigger is commented out, because `DOCKER_USERNAME`/`DOCKER_PASSWORD` are
   still live from 2025 and an auto-run would overwrite
   `joshlopes/game-on-portugal-bot:latest`, which is the image production
   currently pulls and therefore the rollback artifact.

### Phase 2 — HTZ1 preparation (no cutover)

8. Generate a deploy keypair; **append** the restricted line to
   `~ezweb/.ssh/authorized_keys` on HTZ1 (back up and diff the file — it holds
   one line per project). Set `DEPLOY_SSH_KEY` / `DEPLOY_SSH_KNOWN_HOSTS`.
9. Set the `DEPLOY_SSH_*` and `PORTAINER_ENDPOINT_ID` variables.
10. `docker network create proxy` if absent.
11. Create the Portainer stack from `infrastructure/game-on-portugal.yaml` with
    **a placeholder `DISCORD_TOKEN`** so the bot cannot connect and fight the
    live one for slash commands. Record `PORTAINER_STACK_ID`.
12. Restore the phase-0 dump into `gop-db`. Re-verify row counts.
13. Add only the `media.game-on-portugal.pt` DNS record and Caddy vhost; confirm
    the bucket serves a test object publicly.

### Phase 3 — Cutover (the ~15 minutes of downtime)

14. Announce a short maintenance window in the guild.
15. On TedRelayer: `docker compose stop game-on-portugal-app` — **the old bot
    must be down before the new one comes up.** Two bots on one token will both
    receive interactions and double-reply.
16. Take a final delta dump and restore it into `gop-db`.
17. Set the real `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` in the Portainer stack env
    and redeploy.
18. Verify: `docker logs gop-bot` shows `Ready! Logged in as
    GameOnPortugalBot#9387`; run `/ping` in the guild.
19. **Re-enable `deploy.yml`'s `push` trigger** (uncomment the block at the top
    of the file), then push a trivial commit and confirm the pipeline deploys
    end to end.

### Phase 4 — Public cutover (only once plan 03 has a portal)

20. Point the `game-on-portugal.pt` apex and `www` at HTZ1 in the OVH zone, and
    **refresh the zone** — OVH applies the zone, not the individual record.
21. Add the apex Caddy block; reload Caddy.
22. Archive `GameOnPortugal/gameonportugal.github.io` and delete this repo's
    orphaned `webpage/` directory (issue #9).

Steps 20–22 are independent of 14–19 and should not be bundled with them.

### Phase 5 — Decommission

23. Leave the TedRelayer stack **stopped but intact** for at least two weeks.
24. Then remove it, keeping one final dump in 1Password/NAS.
25. Update `docs/operations.md`, `AGENT.md` and `remote-hosts.md`.

## Rollback

Before step 20 rollback is cheap: stop `gop-bot`, `docker compose start
game-on-portugal-app` on TedRelayer. The old stack stays untouched until phase 5,
so the fallback is always one command. Data written to HTZ1 after cutover would
be lost on rollback — a delta dump in the other direction is the mitigation if
the window has been long.

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

- **`DEPLOY_SSH_PORT`** — HTZ1 is documented as `2224`; the ez-web SETUP files
  say `22`. Confirm before phase 2.
- **ARC runners** — I could not query whether the GameOnPortugal org can use
  them (needs `admin:org`). `ubuntu-latest` is free for a public repo, so this
  is a preference, not a blocker.
- **MinIO console** exposure — the Caddy vhost proxies the S3 API only. Decide
  whether the console should be reachable at all.
