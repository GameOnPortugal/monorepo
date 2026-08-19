# Game On Portugal — CI/CD & deployment setup

> ## ⏳ NOT LIVE YET
> The pipeline in this repo is written but **not wired**. Production still runs
> by hand on TedRelayer (`~/game-on-portugal/`, docker-compose). Follow
> [`../docs/plans/04-infrastructure-migration.md`](../docs/plans/04-infrastructure-migration.md)
> to cut over — this file is the reference for how it is meant to be wired.

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

| Secret | Used by | What it is |
| ------ | ------- | ---------- |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | deploy | Docker Hub creds (push to `joshlopes/game-on-portugal-*`) |
| `PORTAINER_ACCESS_TOKEN` | deploy | Portainer API token on HTZ1 — the *Portainer Access Token* field of `op://Personal/Ez-web - Portainer` |
| `DEPLOY_SSH_KEY` | deploy | Private key for the tunnel-only deploy account on HTZ1 |
| `DEPLOY_SSH_KNOWN_HOSTS` | deploy | Pinned `known_hosts` line(s) for HTZ1 |
| `RELEASE_PLEASE_TOKEN` | release-please | Fine-grained PAT, `contents:write` + `pull-requests:write` on this repo. Without it the action falls back to `GITHUB_TOKEN`, whose PRs do **not** trigger CI or the downstream deploy |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `TELEGRAM_THREAD_ID` | deploy, failure-notify | Optional — notifications skip silently if unset |

The old `CAPROVER_*` secrets and `MY_RELEASE_PLEASE_TOKEN` are obsolete: delete
them. They point at *Superman*, decommissioned 2026-06-30.

### Variables

| Variable | Value | Notes |
| -------- | ----- | ----- |
| `DEPLOY_SSH_HOST` | `195.201.192.35` | HTZ1 |
| `DEPLOY_SSH_USER` | `ezweb` | The tunnel-only account. There is **no** `portainer-deploy` user on HTZ1 despite what some SETUP drafts claim |
| `DEPLOY_SSH_PORT` | `2224` | HTZ1 does not use 22 |
| `PORTAINER_ENDPOINT_ID` | `3` | HTZ1 endpoint |
| `PORTAINER_STACK_ID` | *(from step 3)* | |

The deploy key must be added to `~ezweb/.ssh/authorized_keys` on HTZ1
**restricted to the Portainer tunnel and nothing else**, matching the existing
entries:

```
command="echo tunnel-only-key 1>&2; exit 1",restrict,port-forwarding,permitopen="127.0.0.1:9000",permitopen="localhost:9000" ssh-ed25519 AAAA… game-on-portugal
```

> **Append, never rewrite** that file — it holds one line per project
> (`invoice-bot`, `smart-table`, `timeline`, `brawl-teams`, …). Back it up and
> diff afterwards.

## 3. Portainer stack

1. Merge to `main` once so `deploy.yml` builds and pushes
   `joshlopes/game-on-portugal-bot:latest`.
2. Portainer (HTZ1 endpoint) → **Stacks → Add stack → Web editor**, paste
   `infrastructure/game-on-portugal.yaml`, name it `game-on-portugal`.
3. Set the stack **environment variables**:

   | Var | Value |
   | --- | ----- |
   | `MYSQL_ROOT_PASSWORD` | *(strong secret)* |
   | `DISCORD_TOKEN` | the bot token — from `~/game-on-portugal/.env` on TedRelayer |
   | `DISCORD_CLIENT_ID` | the Discord application id |
   | `S3_ACCESS_KEY` | `gameonportugal` |
   | `S3_SECRET_KEY` | *(strong secret, min 8 chars)* |
   | `S3_BUCKET` | `gop-media` |
   | `S3_PUBLIC_URL` | `https://media.game-on-portugal.pt` |
   | `LOKI_HOST` / `LOKI_AUTH` | optional |

   `APP_VERSION` is substituted by the deploy action — do not set it here.

   Several of these use `${VAR:?…}` in the stack file, so a missing secret fails
   the deploy loudly instead of booting a bot with no token (which would start
   cleanly and do nothing — see `InMemoryClient` in `inversify.config.ts`).
4. Deploy, then copy the stack id into the `PORTAINER_STACK_ID` repo variable.
5. The external `proxy` network must exist: `docker network create proxy`.

## 4. DNS & Caddy

`game-on-portugal.pt` is an **OVHcloud** zone (use the `ovhcloud` skill/CLI).

1. DNS — point the apex and `media` at HTZ1, then **refresh the zone** (OVH
   applies the zone, not the individual record):

   ```
   @      IN  A  195.201.192.35
   www    IN  A  195.201.192.35
   media  IN  A  195.201.192.35
   ```

   The apex currently resolves to GitHub Pages (`185.199.108-111.153`) serving
   the 2021 site from `GameOnPortugal/gameonportugal.github.io`. Repointing it
   *is* the public cutover — do it last, and see plan 04 for the ordering.

2. Caddy — append the blocks from `infrastructure/caddy/game-on-portugal.pt.caddy`
   to `/opt/caddy/Caddyfile`, then reload:

   ```bash
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   Until the portal exists (plan 03), only the `media.` vhost has a backing
   container — add the apex block at portal launch, not before, or Caddy will
   log a failing upstream on every request.

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
