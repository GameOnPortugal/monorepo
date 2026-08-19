# Game On Portugal — CI/CD & deployment setup

> ## ✅ LIVE since 2026-08-19
> Production runs on **HTZ1**, Portainer stack `game-on-portugal` (stack id
> `46`, endpoint `3`). Merging to `main` builds, pushes and deploys for real.
> The cutover runbook is [`../docs/plans/04-infrastructure-migration.md`](../docs/plans/04-infrastructure-migration.md)
> (phases 0–3 done); this file is now the reference for how the pipeline is
> actually wired, kept accurate enough to redo the setup from scratch if the
> stack is ever rebuilt. TedRelayer stays stopped-but-intact as the rollback
> path until **2026-09-02** — see [`../docs/operations.md`](../docs/operations.md).

The repo ships the ez-web-style pipeline used by `invoice-bot`, `smart-table`,
`builders-and-builds` and `insight-report-studio`: CI on pull requests, image
build + push to Docker Hub on merge, and a Portainer deploy to **HTZ1** fronted
by the host's central Caddy.

**HTZ1** is the shared Hetzner host `195.201.192.35` — the same box running
`invoices.ez-web.pt`, `docpal.pt`, `smart-table.pt`, `brawl-teams.com` and
`report-studio.ez-web.pt`. It runs Portainer (`:9000`, SSH-tunnel only) and one
central static Caddyfile that reverse-proxies each domain to a container on the
external `proxy` network.

## What runs where

| Workflow | Trigger | Does |
| -------- | ------- | ---- |
| `ci.yml` | PR, push to main | Bot typecheck + integration tests. Single aggregate `CI` status |
| `docker-build.yml` | PR | Validates the production image builds (no push) |
| `deploy.yml` | push to main, manual | Builds + pushes `joshlopes/game-on-portugal-bot`, rolls the Portainer stack |
| `release-please.yml` | push to main | Maintains release PRs, tags, CHANGELOGs |
| `pr-title.yml` | PR | Enforces Conventional Commits on the PR title |
| `labeler.yml` | PR | Path-based labels |
| `security.yml` | PR, push, weekly | CodeQL + Trivy + Gitleaks |
| `workflow-failed.yml` | any failure | Telegram ping |

Runners are `ubuntu-latest`. This repo is **public**, so GitHub-hosted runners
and code scanning are free — unlike the private ez-web repos this pattern came
from, there is no reason to depend on the self-hosted ARC runners (and no
evidence the GameOnPortugal org has access to them).

## 1. Repo settings

- Default branch `main`; **allow squash merging only**. PR titles are linted as
  Conventional Commits and become the squash commit that release-please reads.
- Branch protection on `main`: require the `CI` status check.
- The repo's history is ~30 consecutive `chore:` commits, which is exactly why
  release-please has never cut a release. `pr-title.yml` prevents a recurrence.

## 2. Secrets & variables

`Settings → Secrets and variables → Actions`.

### Secrets

All of these are created and live as of 2026-08-19, except where noted.

| Secret | Used by | What it is |
| ------ | ------- | ---------- |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | deploy | Docker Hub creds (push to `joshlopes/game-on-portugal-*`). Pre-existing, kept |
| `PORTAINER_ACCESS_TOKEN` | deploy | Portainer API token on HTZ1 — the *Portainer Access Token* field of `op://Personal/Ez-web - Portainer` |
| `DEPLOY_SSH_KEY` | deploy | Private key for the tunnel-only deploy account on HTZ1 |
| `DEPLOY_SSH_KNOWN_HOSTS` | deploy | Pinned `known_hosts` line(s) for HTZ1 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `TELEGRAM_THREAD_ID` | deploy, failure-notify | **Still outstanding** — optional, notifications skip silently while unset |

The old `CAPROVER_DISCORD_BOT_APP`, `CAPROVER_DISCORD_BOT_TOKEN`,
`CAPROVER_SCHEDULER_APP`, `CAPROVER_SCHEDULER_TOKEN` and `CAPROVER_SERVER`
secrets were obsolete (pointed at *Superman*, decommissioned 2026-06-30) and
have been **deleted**. `MY_RELEASE_PLEASE_TOKEN` predates this pipeline too,
but `release-please.yml` does not read it (see below) — it was left in place
rather than deleted, and is safe to remove whenever `RELEASE_PLEASE_TOKEN` is
finally created.

`RELEASE_PLEASE_TOKEN` (a fine-grained PAT, `contents:write` +
`pull-requests:write`) is **still outstanding** — it cannot be minted
non-interactively, so `release-please.yml` currently falls back to
`GITHUB_TOKEN`. That works, but PRs opened with the default token do not
trigger CI or the downstream deploy on the release PR itself. Mint it and set
it when someone has interactive GitHub access.

Also still outstanding: copying the real bot token into 1Password (it exists
only in the Portainer stack env and in `~/game-on-portugal/.env` on the
stopped-but-intact TedRelayer host right now).

### Variables

| Variable | Value | Notes |
| -------- | ----- | ----- |
| `DEPLOY_SSH_HOST` | `195.201.192.35` | HTZ1 |
| `DEPLOY_SSH_USER` | `ezweb` | The tunnel-only account. There is **no** `portainer-deploy` user on HTZ1 despite what some SETUP drafts claim |
| `DEPLOY_SSH_PORT` | `2224` | HTZ1 does not use 22 — confirmed by a working tunnel (this resolves plan 04's open item on the port) |
| `PORTAINER_ENDPOINT_ID` | `3` | HTZ1 endpoint |
| `PORTAINER_STACK_ID` | `46` | Stack `game-on-portugal` on HTZ1 |

The deploy key has been **appended** to `~ezweb/.ssh/authorized_keys` on HTZ1
**restricted to the Portainer tunnel and nothing else**, matching the existing
entries:

```
command="echo tunnel-only-key 1>&2; exit 1",restrict,port-forwarding,permitopen="127.0.0.1:9000",permitopen="localhost:9000" ssh-ed25519 AAAA… game-on-portugal
```

A backup of the file from before the append is at
`~/.ssh/authorized_keys.bak-2026-08-19` on HTZ1; the diff against it confirmed
exactly one line was added.

> **Append, never rewrite** that file — it holds one line per project
> (`invoice-bot`, `smart-table`, `timeline`, `brawl-teams`, …). Back it up and
> diff afterwards.

## 3. Portainer stack — done, stack id 46

Built from `infrastructure/game-on-portugal.yaml`, name `game-on-portugal`,
HTZ1 endpoint `3`. Services: `gop-bot`, `gop-db` (MariaDB 11.7.2), `gop-minio`,
`gop-createbuckets`, `gop-db-backup`. `PORTAINER_STACK_ID=46` is set as a repo
variable.

The stack **environment variables** currently set (values live only in
Portainer + the deploy secrets, not here):

| Var | Value |
| --- | ----- |
| `MYSQL_ROOT_PASSWORD` | strong secret, set in Portainer |
| `DISCORD_TOKEN` | the real bot token, applied at cutover (phase 3) |
| `DISCORD_CLIENT_ID` | the Discord application id |
| `S3_ACCESS_KEY` | `gameonportugal` |
| `S3_SECRET_KEY` | strong secret, set in Portainer |
| `S3_BUCKET` | `gop-media` |
| `S3_PUBLIC_URL` | `https://media.game-on-portugal.pt` |
| `LOKI_HOST` / `LOKI_AUTH` | not set — see the plaintext-password note in `docs/operations.md` |

`APP_VERSION` is substituted by the deploy action on every run — do not set it
by hand.

Several of these use `${VAR:?…}` in the stack file, so a missing secret fails
the deploy loudly instead of booting a bot with no token (which would start
cleanly and do nothing — see `InMemoryClient` in `inversify.config.ts`).

The production dump was restored into `gop-db` during phase 2 and re-verified
by row count after the phase-3 delta restore. The external `proxy` network
already existed on HTZ1 (shared with the other stacks); nothing to create.

**Decided**: the MinIO **console** is not exposed by Caddy — only the public
`gop-media` bucket (the S3 API, read-only for objects) is reachable from the
internet. Resolves plan 04's open item on MinIO console exposure.

To rebuild the stack from scratch: Portainer (HTZ1 endpoint) → **Stacks → Add
stack → Web editor**, paste `infrastructure/game-on-portugal.yaml`, name it
`game-on-portugal`, set the variables above, deploy, then update
`PORTAINER_STACK_ID` if the new stack gets a different id.

## 4. DNS & Caddy

`game-on-portugal.pt` is an **OVHcloud** zone (use the `ovhcloud` skill/CLI).

**Done**: `media.game-on-portugal.pt` → HTZ1.

```
media  IN  A  195.201.192.35   (OVH record id 5429963149, TTL 300)
```

The zone was backed up to `~/ovh-zone-backups/2026-08-19/` before the change
and refreshed afterwards (OVH applies the zone, not the individual record). The
Caddy block for `media.` was appended to the host's central
`/opt/caddy/Caddyfile` (backup at `~ezweb/caddy-backups/` — the `ezweb` user is
in the `caddy-editors` group so it can *write* the Caddyfile but **cannot
create new files directly in `/opt/caddy/`**), validated with `caddy validate`,
and reloaded:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Verified end to end: an object uploaded to the `gop-media` bucket is served
publicly at `https://media.game-on-portugal.pt/gop-media/<key>` over
Caddy-provisioned TLS.

**Not done, deliberately** (plan 04 phase 4 / GLOBAL-PLAN M8.15): the apex and
`www` still point at GitHub Pages, serving the 2021 site from
`GameOnPortugal/gameonportugal.github.io`. Repointing those is the *public*
cutover and waits for the portal (plan 03):

```
@      IN  A  195.201.192.35
www    IN  A  195.201.192.35
```

Until the portal exists, only the `media.` vhost has a backing container —
adding the apex block before then would make Caddy log a failing upstream on
every request.

## 5. Verifying a deploy

```bash
ssh -p 2224 ezweb@195.201.192.35 "docker ps --filter name=gop- --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'"
ssh -p 2224 ezweb@195.201.192.35 "docker logs --tail 30 gop-bot"
```

A healthy boot: `MariaDB is ready!` → `No pending migrations to apply.` →
`Successfully reloaded N application (/) commands.` → `⚡️ Discord Bot app is
running!` → `Ready! Logged in as GameOnPortugalBot#9387`.

> The bot's first log line currently prints the database root password in
> plaintext (issue #11). Fix that before enabling `LOKI_HOST`, or the password
> ships to Grafana.

## Deliberate differences from the ez-web template

- **`ubuntu-latest`, not ARC.** Public repo → free hosted runners, no dependency
  on runner access this org may not have.
- **CodeQL/Trivy SARIF is uploaded**, not discarded. Code scanning is free for
  public repos; the ez-web repos skip upload because GHAS is paid for private
  ones.
- **PAT rather than a GitHub App** for release-please. The ez-web repos mint a
  token from `ez-web-gh-app`; GameOnPortugal has no App. Switch to
  `actions/create-github-app-token` if one is ever created — it is strictly
  better than a long-lived PAT.
- **One component, not two.** `release-please-config.json` only tracks
  `discord-bot`. Add `portal-api` / `portal-web` when plan 03 scaffolds them —
  release-please errors on a package path that does not exist.
