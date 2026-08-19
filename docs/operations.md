# Operations

How the code gets from a commit to the Discord server, and what to check when it
does not.

## ⚠️ Read this first: CI does not deploy *yet*

The old workflows deployed to CapRover on **Superman**, a Hetzner box
decommissioned on **2026-06-30**. The stack was hand-migrated to **TedRelayer**
and never re-wired.

Those workflows have now been **replaced** with the house pipeline — Portainer
over an SSH tunnel to HTZ1, with release-please cutting versions on merge (see
`infrastructure/SETUP.md`). But the credentials, the Portainer stack and the DNS
cutover are still outstanding, so until
[`plans/04-infrastructure-migration.md`](plans/04-infrastructure-migration.md)
is executed:

- **Production is still updated manually** on TedRelayer (see
  [Deploying today](#deploying-today)).
- `joshlopes/game-on-portugal-bot:latest` on Docker Hub is from 2025-06-30 and
  *is* what production runs. The scheduler image is from 2025-04-19 and is
  **one commit stale in a way that disables its only job**.

## Where production actually is

```bash
ssh -p 2224 tedcrypto@192.168.0.184        # TedRelayer, the home media server
cd ~/game-on-portugal                       # docker-compose.yml + .env
docker compose ps
```

Five containers: `game-on-portugal-{app,scheduler,db,redis,db-backup}`. The
database is MariaDB 11.5.2, schema `discord-bot`, backed up to the NAS by
`databack/mysql-backup`. The `redis` container is inherited cruft — the current
bot never connects to it.

Credentials live only in `~/game-on-portugal/.env` on that host (mode `0600`).
There is no copy in the repo or in 1Password; **that file is the single point of
failure for the whole deployment** and should be backed up somewhere durable.

### Deploying today

```bash
ssh -p 2224 tedcrypto@192.168.0.184
cd ~/game-on-portugal
docker compose pull game-on-portugal-app
docker compose up -d game-on-portugal-app
docker compose logs -f --tail 50 game-on-portugal-app
```

This pulls whatever CI last pushed to `:latest`. There is no rollback beyond
re-pulling an older tag by digest, and no health gate — the container restarts
`unless-stopped` regardless of whether the bot actually logged in.

## Pipeline (as configured — not yet wired to a host)

```
pull request
      ├─ ci.yml           typecheck (prisma generate + tsc --noEmit) + integration tests
      ├─ docker-build.yml production image builds (no push)
      ├─ pr-title.yml     Conventional Commits on the PR title
      ├─ labeler.yml      path-based labels
      └─ security.yml     CodeQL + Trivy + Gitleaks

merge to main
      ├─ ci.yml + security.yml
      ├─ release-please.yml  release PR / tag / CHANGELOG per component
      └─ deploy.yml          build + push joshlopes/game-on-portugal-bot:{latest,<sha>}
                             → Portainer stack `game-on-portugal` on HTZ1
                                (SSH tunnel → PUT /api/stacks/{id})
                             → Telegram notification

any failure → workflow-failed.yml → Telegram
```

Full wiring reference — secrets, variables, Portainer stack, DNS, Caddy — is in
[`../infrastructure/SETUP.md`](../infrastructure/SETUP.md).

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

Scheduler needs `APP_CONTAINER_NAME` — a substring matching the running bot
container.

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

Note `package.json` has a `test:local` script pointing at `.env.local`, a file
that does not exist and is not documented anywhere.

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
ssh -p 2224 tedcrypto@192.168.0.184 "docker logs --tail 50 game-on-portugal-app"

# database (reads .env on the host so no password is typed or shell-logged)
ssh -p 2224 tedcrypto@192.168.0.184 \
  'set -a; . ~/game-on-portugal/.env; set +a;
   docker exec game-on-portugal-db mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" \
     discord-bot -e "SELECT COUNT(*) FROM ads;"'
```

A healthy boot looks like: `MariaDB is ready!` → `No pending migrations to
apply.` → `Successfully reloaded 4 application (/) commands.` → `⚡️ Discord Bot
app is running!` → `Ready! Logged in as GameOnPortugalBot#9387`.

Note the first log line **prints the database root password in plaintext**
(`entrypoint.sh` echoes it in the connection-retry message). Treat container logs
as secret-bearing, and be careful about pasting them — this also means enabling
`LOKI_HOST` would ship the password to Grafana.

## Debugging a dead bot

1. `docker compose ps` on TedRelayer — is `game-on-portugal-app` up?
2. `DISCORD_TOKEN` present in `~/game-on-portugal/.env`? If not, `InMemoryClient`
   is bound and the process looks perfectly healthy while doing nothing.
3. Stuck on `Waiting for MariaDB...`? `DATABASE_URL` is wrong or the DB is down —
   and the wait loop never times out, so it will sit there forever.
4. Slash commands missing? Registration is global and cached by Discord for up
   to an hour; also check `DISCORD_CLIENT_ID` and that `registerSlashCommands`
   did not swallow an error — it only `console.error`s and continues.
5. Logs: container stdout always; Loki only if `LOKI_HOST` is configured (it is
   not, in the current deployment).

## Debugging a job that never runs

The scheduler is the component most likely to be silently doing nothing. Check
what the *container* believes, not what the repo says:

```bash
ssh -p 2224 tedcrypto@192.168.0.184 \
  "docker exec game-on-portugal-scheduler cat /srv/config.ini | grep -A3 job-exec"
```

As of 2026-08-19 every job in there is commented out — the deployed image
predates the commit that enabled the weekly winner. Chadburn logs a line per job
execution; if `docker logs game-on-portugal-scheduler` shows only
`update-container-id` supervisord chatter, nothing is scheduled at all.

## Verified 2026-08-19

- `bun test` — 32 pass, 0 fail, against MariaDB 11.7.2.
- `docker build --target runtime --build-arg APP_ENV=prod` — succeeds, clean,
  only a Prisma "no output path specified" deprecation warning.
- `bunx tsc --noEmit` — **fails**, 6 errors. See [known-issues.md](known-issues.md).
