# Operations

How the code gets from a commit to the Discord server, and what to check when it
does not.

## Production is HTZ1

Since the **2026-08-19** cutover ([`plans/04-infrastructure-migration.md`](plans/04-infrastructure-migration.md),
phases 0–3), the bot runs as Portainer stack `game-on-portugal` (stack id
`46`, endpoint `3`) on **HTZ1** (`195.201.192.35`), and **merging to `main`
deploys it** — `deploy.yml`'s `push` trigger is enabled. `joshlopes/game-on-portugal-bot:latest`
on Docker Hub is what HTZ1 pulls.

TedRelayer (the old home-server deployment) is **not production anymore**. It
is kept stopped-but-intact as the rollback path until **2026-09-02** — see
[Rollback path](#rollback-path-until-2026-09-02) below.

## Accessing HTZ1

HTZ1 is a shared Hetzner host; Portainer's API (`:9000`) is firewalled to
localhost, reachable only over an SSH tunnel — the same pattern used by
`invoice-bot`, `smart-table`, `brawl-teams` and the other projects on that box.

```bash
ssh -p 2224 ezweb@195.201.192.35 "docker ps --filter name=gop- --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'"
ssh -p 2224 ezweb@195.201.192.35 "docker logs --tail 50 gop-bot"
```

CI's deploy key on `ezweb` is **forced-command, tunnel-only**
(`permitopen=127.0.0.1:9000`, `restrict`, no shell) — one such key per HTZ1
project, appended to `~ezweb/.ssh/authorized_keys`. `deploy.yml` reaches
Portainer through it via `.github/actions/portainer-deploy`, using the
`DEPLOY_SSH_KEY` / `DEPLOY_SSH_KNOWN_HOSTS` secrets and the `DEPLOY_SSH_HOST` /
`DEPLOY_SSH_USER` / `DEPLOY_SSH_PORT` / `PORTAINER_ENDPOINT_ID` /
`PORTAINER_STACK_ID` variables. A human's own key on the same account normally
has an ordinary shell, which is what the `docker ps` / `docker logs` commands
above assume. To open the Portainer UI itself from a laptop, tunnel `:9000`
the same way and browse `https://localhost:9000`.

Containers: `gop-bot`, `gop-db` (MariaDB 11.7.2), `gop-minio`,
`gop-createbuckets`, `gop-db-backup`, `gop-portal-api`, `gop-portal-web`
(added by plan 03/M8 — see [Portal](#portal-m8) below). There is no `redis`
container — the current bot never reads `REDIS_DSN`.

### Deploying

Normal path: merge a PR to `main`. `deploy.yml` builds and pushes
`joshlopes/game-on-portugal-bot:{latest,<sha>}`, then rolls the Portainer stack
over the SSH tunnel and posts to Telegram (if the optional Telegram secrets are
set — see `infrastructure/SETUP.md`).

Manual path: run `deploy.yml` via `workflow_dispatch` from the Actions tab —
useful for redeploying without a new commit (e.g. after changing a stack
environment variable in Portainer directly).

There is still no health gate beyond Docker's own restart policy — a redeploy
that boots but fails to log in to Discord will not fail the workflow. Verify
manually (below) after anything that touches auth or the database.

### Verifying a deploy

```bash
ssh -p 2224 ezweb@195.201.192.35 "docker logs --tail 30 gop-bot"
```

A healthy boot: `MariaDB is ready!` → `No pending migrations to apply.` →
`Successfully reloaded N application (/) commands.` → `⚡️ Discord Bot app is
running!` → `Ready! Logged in as GameOnPortugalBot#9387`.

> The bot's first log line still prints the database root password in
> plaintext (known issue #11 / work item M0.7, unchanged by this migration).
> Treat `gop-bot` logs as secret-bearing, and fix this before enabling
> `LOKI_HOST` or the password ships to Grafana.

### Rolling back

```bash
ssh -p 2224 ezweb@195.201.192.35 "docker stop gop-bot"
ssh -p 2224 tedcrypto@192.168.0.184 \
  "cd ~/game-on-portugal && docker compose start game-on-portugal-app"
```

Only valid until TedRelayer is decommissioned (2026-09-02, plan 04 phase 5).
Data written to HTZ1 after the cutover would be lost on rollback — take a
delta dump in the other direction first if the window since cutover has been
long. After 2026-09-02 this section and the one below should be deleted; there
will be nothing to roll back to.

## Pipeline

```
pull request
      ├─ ci.yml           typecheck (prisma generate + tsc --noEmit) + integration tests
      ├─ docker-build.yml production image builds (no push)
      ├─ pr-title.yml     Conventional Commits on the PR title
      ├─ labeler.yml      path-based labels
      └─ security.yml     CodeQL + Trivy + Gitleaks

merge to main
      ├─ ci.yml + security.yml
      ├─ release-please.yml  release PR / tag / CHANGELOG per component, then
      │                      enables auto-merge on ONE open release PR (see
      │                      "Releases merge themselves" below) — so a release
      │                      lands, tags, and deploys with no manual click
      └─ deploy.yml          build + push joshlopes/game-on-portugal-{bot,portal-api,portal-web}:{latest,<sha>}
                             → Portainer stack `game-on-portugal` (id 46) on HTZ1
                                (SSH tunnel → PUT /api/stacks/46)
                             → health-checks gop-bot, gop-portal-api, gop-portal-web
                                (M8.14 — the portal joined the health gate; see "Portal" below)
                             → Telegram notification (optional secrets, currently unset)

any failure → workflow-failed.yml → Telegram
```

Full wiring reference — secrets, variables, Portainer stack, DNS, Caddy — is in
[`../infrastructure/SETUP.md`](../infrastructure/SETUP.md).

## Releases merge themselves

Nothing about a release is manual. Merge a `feat:`/`fix:` PR and the chain runs
to production on its own:

1. `release-please.yml` opens (or updates) the release PR for each affected
   component — `discord-bot`, `portal-api`, `portal-web`.
2. The same run enables GitHub auto-merge on **one** open release PR. It lands
   as soon as the required `CI` check is green.
3. That merge pushes `main`, which re-runs `release-please.yml` — cutting the
   tag + GitHub Release for what just merged, and queueing the next release PR
   — and runs `deploy.yml`, which rebuilds the images and rolls the Portainer
   stack.

Two consequences worth knowing:

- **One release per cycle, by design.** All three components share
  `.github/.release-please-manifest.json` and each release PR rewrites its own
  line of it. Those lines are adjacent, so git cannot 3-way merge two of them —
  the second PR to land would conflict. Three pending releases therefore drain
  over three cycles, a few minutes apart.
- **Stale release PRs are closed and rebuilt, not rebased.** This is the part
  that is easy to get wrong: release-please does *not* refresh a release branch
  just because main moved. It rewrites one only when that component's own
  release content changes, so a sibling's release leaves the others behind as
  conflicting branches. (Observed 2026-08-21: portal-api's release PR #68 was
  stranded while discord-bot and portal-web released past it.) So the workflow's
  first step closes any conflicting release PR and deletes its branch, and the
  release-please step immediately rebuilds it from the current main. Expect
  release PR *numbers* to change between cycles — that is this, working.
- **A red release PR just sits there.** Auto-merge waits for `CI`; it is not a
  bypass. Fix the PR (or main) and it lands by itself.
- **Intermediate deploys can be cancelled.** Three release merges in quick
  succession queue three `deploy.yml` runs, and GitHub keeps only one run
  pending per concurrency group — a third arrival cancels the queued second.
  Harmless: every deploy builds all three images from whatever main is at, so
  the last one to run carries the whole set. A cancelled deploy in that burst
  is not something to re-run.

If the chain ever stalls, re-kick it with `gh workflow run release-please.yml`
rather than merging by hand, so the next PR in line gets queued too.

## Portal (M8)

The portal (`portal/api`, `portal/web` — [`plans/03-portal.md`](plans/03-portal.md))
deploys through the exact same pipeline as the bot: `deploy.yml` builds and
pushes `joshlopes/game-on-portugal-portal-api`/`-portal-web` alongside the
bot's image on every merge to `main`, and the same `infrastructure/game-on-portugal.yaml`
stack (id 46) runs all three. **`gop-portal-api` and `gop-portal-web` are
live on HTZ1 today** — there was no separate portal pipeline to build (M8.14
found this already true, see the M8.14 row of `GLOBAL-PLAN.md`), only gaps to
close:

- **The deploy health gate didn't cover them.** Until this change,
  `deploy.yml` only passed `health-check-container: gop-bot` to
  `.github/actions/portainer-deploy` — a portal container could crash-loop
  through every deploy, silently, the same failure mode that step exists to
  catch for the bot (see that action's own header comment for the 2026-08-20
  incident that motivated it). The action now accepts a space-separated list
  and `deploy.yml` passes all three container names.
- **No public URL yet.** `game-on-portugal.pt`'s apex still points at the
  2021 GitHub Pages site — the Caddy block that would front `gop-portal-web`
  publicly (`infrastructure/caddy/game-on-portugal.pt.caddy`) exists in this
  repo but has **not** been applied to HTZ1's live Caddyfile. That's **M8.15**,
  a DNS + Caddy cutover Luis makes deliberately, not part of this work. Until
  then the portal containers are up and internally healthy (`gop-portal-web`'s
  own healthcheck hits `127.0.0.1:8080`, `gop-portal-api`'s hits
  `http://localhost:3001/health`) but only reachable from inside HTZ1's
  Docker networks — verify with `docker exec gop-portal-web wget -qO- http://127.0.0.1:8080/` /
  `docker exec gop-portal-api bun -e "fetch('http://localhost:3001/health').then(r=>r.text()).then(console.log)"`
  over the same SSH access as [Accessing HTZ1](#accessing-htz1) describes.
- **Admin OAuth (M8.10) is off by default.** `portal-api` needs
  `DISCORD_CLIENT_ID` (already set, reused from the bot), plus two secrets
  that do **not** exist in the Portainer stack env yet:
  - `DISCORD_CLIENT_SECRET` — Discord Developer Portal → the Game On Portugal
    application → OAuth2 tab → "Client Secret" → Reset Secret. Also add the
    redirect URI there: `https://game-on-portugal.pt/api/auth/callback` (and,
    for local testing before M8.15's DNS cutover, whatever host is used to
    reach `gop-portal-api` — see `portal/api/.env.example`'s OAuth section
    for the full walkthrough, including the local-dev redirect).
  - `SESSION_SECRET` — any random ≥32-byte value, e.g. `openssl rand -hex 32`.
    Signs the admin session cookie (`portal/api/src/lib/session.ts` — there is
    no session table). Rotating it logs out every admin at once.

  Until both are set, `/api/auth/*` and `/api/admin/*` answer `503` and every
  public page/route is unaffected — see `portal/api/src/lib/discordAuth.ts`'s
  `loadOAuthConfig()`. Add them as Portainer stack environment variables (same
  place as `DISCORD_TOKEN`/`MYSQL_ROOT_PASSWORD` today), then redeploy
  (`workflow_dispatch` on `deploy.yml`, no code change needed).
- **The admin audit log (M8.11) lives outside MySQL entirely** — a SQLite
  file at `/data/audit.db` inside `gop-portal-api`, on the new
  `portal_audit_data` named volume (`infrastructure/game-on-portugal.yaml`).
  It is *not* covered by `gop-db-backup` (that backs up the bot's MySQL
  schema only) — if the audit trail needs to survive a host loss, back up
  that volume too. Not done here: this is new-in-M8.11 infrastructure with
  no production history yet, and the nightly-backup wiring is a distinct,
  reviewable change of its own.
- **`sitemap.xml`/`robots.txt` (M8.13)** are served at the site root once
  M8.15 exposes it publicly — `robots.txt` is a static file,
  `sitemap.xml` is generated live by `portal-api` (`src/routes/seo.ts`) and
  proxied by `gop-portal-web`'s nginx, same pattern as `/api/` and `/health`.

## Rollback path (until 2026-09-02)

This section documents the **old** TedRelayer deployment, kept running
stopped-but-intact as the fallback for the two weeks after cutover
(2026-08-19 → 2026-09-02, plan 04 phase 5). It is not production; do not deploy
here for anything except an actual rollback.

```bash
ssh -p 2224 tedcrypto@192.168.0.184        # TedRelayer, the home media server
cd ~/game-on-portugal                       # docker-compose.yml + .env
docker compose ps
```

Five containers exist here, three still running: `game-on-portugal-db`,
`game-on-portugal-redis`, `game-on-portugal-db-backup`. `game-on-portugal-app`
and `game-on-portugal-scheduler` were **stopped** at cutover and must stay that
way while `gop-bot` is live on HTZ1 — two bots on one Discord token both
receive interactions and double-reply.

The database is MariaDB 11.5.2, schema `discord-bot`, backed up nightly to the
NAS by `databack/mysql-backup`. That backup **was silently broken for seven
weeks** (see known issue #25) — fixed 2026-08-19, but worth a spot-check before
relying on it for anything.

Credentials live only in `~/game-on-portugal/.env` on that host (mode `0600`).
There is **still no copy in 1Password** — copying it over remains an
outstanding task from the migration (see `infrastructure/SETUP.md`).

To bring the old bot back up:

```bash
ssh -p 2224 tedcrypto@192.168.0.184
cd ~/game-on-portugal
docker compose start game-on-portugal-app
docker compose logs -f --tail 50 game-on-portugal-app
```

Do this **after** stopping `gop-bot` on HTZ1, not before.

## Runtime environment (bot)

| Variable            | Required | Effect                                                                 |
| ------------------- | -------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | `mysql://user:pass@host:3306/db`. Parsed by `entrypoint.sh` **and** Prisma |
| `DISCORD_TOKEN`     | yes      | Absent ⇒ container silently binds `InMemoryClient` and the bot does nothing |
| `DISCORD_CLIENT_ID` | yes      | Target of the global slash-command registration                        |
| `APP_ENV`           | yes      | `prod` / `dev` / `test`                                                |
| `LOKI_HOST`         | no       | Enables Grafana Loki log shipping                                      |
| `LOKI_AUTH`         | no       | Basic auth for Loki                                                    |

`.env.example` does **not** match this table — see [known-issues.md](known-issues.md).

## Container startup

`discord-bot/docker/entrypoint.sh`:

1. Parses `DATABASE_URL` with `cut`/`sed` into user/pass/host/port.
2. Loops on `mariadb -e 'SELECT 1'` until the database answers — **unbounded, no
   timeout**. A wrong `DATABASE_URL` produces a container that hangs forever
   printing `Waiting for MariaDB...` rather than failing.
3. `ulimit -c 0`.
4. `bunx prisma migrate deploy`.
5. `bun run src/index.ts`.

The URL parsing is positional `cut`, so a password containing `:` or `@` will
break it.

## Local development

```bash
cd discord-bot
cp .env.example .env        # Makefile does `include .env`; also fix it per the table above
make up                     # bot + mariadb via docker-compose.yml
make db.dev.setup           # reset + push schema
make shell                  # get inside the container
make tests
```

Outside docker, with Node ≥ 18.18 (nvm 24.x on this machine — system Node 18.16
fails Prisma's preinstall check):

```bash
bun install && bunx prisma generate
docker run -d --name gop-test-mariadb \
  -e MARIADB_ROOT_PASSWORD=rootpassword -e MARIADB_DATABASE=discord_bot_test \
  -p 3399:3306 mariadb:11.7.2
export DATABASE_URL='mysql://root:rootpassword@127.0.0.1:3399/discord_bot_test'
bunx prisma db push --skip-generate && bun test
```

## Migrations

```bash
make db.diff NAME=add_something   # prisma migrate dev --create-only
make db.migrate                   # prisma migrate deploy
```

Production applies migrations automatically at boot. There is no rollback path
beyond `prisma migrate reset`, which is destructive — treat migrations against
the production database as one-way.

## Running the weekly job by hand

```bash
# inside the bot container
bun run:command week-screenshot-winner              # for the current week
bun run:command week-screenshot-winner 2026-08-16   # for a given week
bun run:command week-screenshot-winner 2026-08-16 true   # dry run, announces nothing
```

The dry-run flag is the second positional argument and is worth using first: the
non-dry path posts publicly to the screenshots channel and grants 1000 XP.

## Inspecting production

```bash
# logs
ssh -p 2224 ezweb@195.201.192.35 "docker logs --tail 50 gop-bot"

# database
ssh -p 2224 ezweb@195.201.192.35 \
  'docker exec gop-db mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" \
     discord-bot -e "SELECT COUNT(*) FROM ads;"'
```

The second command needs `MYSQL_ROOT_PASSWORD` in the shell — it is a Portainer
stack env var, not a host env var, so there is no `.env` on HTZ1 to source the
way there was on TedRelayer. Pull it from Portainer (`Stacks → game-on-portugal
→ Environment variables`) over the tunnel, or from 1Password.

A healthy boot looks like: `MariaDB is ready!` → `No pending migrations to
apply.` → `Successfully reloaded 4 application (/) commands.` → `⚡️ Discord Bot
app is running!` → `Ready! Logged in as GameOnPortugalBot#9387`.

Note the first log line **prints the database root password in plaintext**
(`entrypoint.sh` echoes it in the connection-retry message, known issue #11).
Treat container logs as secret-bearing, and be careful about pasting them —
this also means enabling `LOKI_HOST` would ship the password to Grafana.

## Debugging a dead bot

1. `docker ps --filter name=gop-` on HTZ1 (over the tunnel) — is `gop-bot` up?
2. `DISCORD_TOKEN` set in the Portainer stack env? The stack file uses
   `${DISCORD_TOKEN:?…}`, so a missing value fails the deploy loudly rather
   than booting a silent `InMemoryClient` — but a *wrong* token still boots
   cleanly and does nothing.
3. Stuck on `Waiting for MariaDB...`? `DATABASE_URL` is wrong or `gop-db` is
   down — and the wait loop never times out, so it will sit there forever.
4. Slash commands missing? Registration is global and cached by Discord for up
   to an hour; also check `DISCORD_CLIENT_ID` and that `registerSlashCommands`
   did not swallow an error — it only `console.error`s and continues.
5. Logs: container stdout always; Loki only if `LOKI_HOST` is configured (it is
   not, in the current deployment).

## The weekly job still does not run anywhere

The old `scheduler/` container (Chadburn) never ran the weekly screenshot
winner in production (its image predated the commit that enabled the job —
known issue #3), and it was **retired and then deleted** — `infrastructure/game-on-portugal.yaml`
has no scheduler service, and the `scheduler/` directory was removed from the
repo. So there is **no cron trigger for `week-screenshot-winner` anywhere**; it can only be run by hand
(below) until [`plans/02-scheduler-and-lifecycle.md`](plans/02-scheduler-and-lifecycle.md)'s
in-process-cron replacement is built (M6.1). Do not assume the job runs just because
the migration happened — it is an independent, still-open piece of work.

## Verified 2026-08-19

- `bun test` — 32 pass, 0 fail, against MariaDB 11.7.2.
- `docker build --target runtime --build-arg APP_ENV=prod` — succeeds, clean,
  only a Prisma "no output path specified" deprecation warning.
- `bunx tsc --noEmit` — **fails**, 6 errors. See [known-issues.md](known-issues.md).
