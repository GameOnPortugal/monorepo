# Game On Portugal — revival session log (2026-08-19)

> Moved into the repo from `~/claude-plans/2026-08-19-gameonportugal-revival.md`.
> This is the **durable record** of the session that produced `docs/` and
> `docs/plans/` — what was explored, what was decided and why. It is history, not
> a work queue: the work queue is [`plans/GLOBAL-PLAN.md`](plans/GLOBAL-PLAN.md).

**Status**: planning complete; CI/CD pipeline + infra scaffolding built; two
production bugs fixed. 2026-08-19.

## TL;DR

The GameOnPortugal monorepo went dormant on 2025-06-30 but the Discord bot never
stopped running — it is live on TedRelayer with 4,477 trophies, 624 screenshots
and 70 ads of real community data, and members still use it. Fourteen months of
absence hid three production failures that nobody noticed, because the project
has no feedback loop of any kind. This session documented the whole system from
scratch (`AGENT.md` + `docs/`), audited it against production, and wrote four
agent-ready plans: marketplace overhaul, scheduler/lifecycle, a new community
portal, and the migration off the home server. The CI/CD pipeline and infrastructure definitions are built and validated; what
remains there is credentials, a Portainer stack and a DNS cutover.

## What was done (2026-08-19)

1. **Full exploration and documentation.** Created `AGENT.md` (symlinked to
   `CLAUDE.md`) and `docs/`: `state-of-the-project.md`, `architecture.md`,
   `operations.md`, `known-issues.md`, `revival-plan.md`. Everything verified
   against the running system rather than inferred.
2. **Production audit** over SSH to TedRelayer — containers, logs, database,
   Discord API. Found and quantified three live bugs.
3. **Four plans** in `docs/plans/`, written to be handed to independent agents:
   `00-overview.md` (shared context), `01-marketplace-overhaul.md`,
   `02-scheduler-and-lifecycle.md`, `03-portal.md`, `04-infrastructure-migration.md`.
   Every open question has been **decided** and recorded in each plan.
4. **Replaced the whole CI/CD pipeline** with the ez-web house pattern: deleted
   the nine CapRover-era workflows, added `ci · docker-build · deploy ·
   release-please · pr-title · labeler · security · workflow-failed`, the
   `portainer-deploy` composite action, the `game-on-portugal` Portainer stack
   (bot + MariaDB + **new MinIO** + backup), the Caddy vhosts, and
   `infrastructure/SETUP.md`. `actionlint` clean.
5. **Fixed issues #1 and #4** so CI can actually go green: relaxed
   `Ad.state/price/zone` to nullable (no migration needed — the DB was already
   nullable, only `schema.prisma` disagreed) and fixed the two real type errors
   in `DeleteAdSubcommand.ts`. `bun run typecheck` clean, 32/32 tests pass,
   `prisma migrate diff` reports no drift.
6. **Updated `~/.claude/projects/-Users-joshlopes/memory/remote-hosts.md`** with
   the Game On Portugal deployment specifics.

Nothing committed — the work sits in the worktree
`/Users/joshlopes/work/gameonportugal/.worktrees/new-task-82ca7140` on branch
`luis/new-task-82ca7140`. Source changes are limited to the three files in item 5
plus `package.json` (a `version` field, required by release-please's `node` type,
and a `typecheck` script).

## Findings worth not relearning

**The deployment moved and the repo never found out.** Superman (CapRover) was
decommissioned 2026-06-30; the stack was hand-migrated to TedRelayer as plain
docker-compose at `~/game-on-portugal/`, and nobody updated the repo — so
**merging to `main` did nothing**. The workflows have now been rewritten to
target HTZ1, but until plan 04 is executed production still only changes via
`docker compose pull && up -d` over SSH.

**`/marketplace sell` fails on every use.** `CreateAdHandler.handle()` returns
`void`; `SellSubcommand` awaits it and reads `ad.id` → `TypeError`. The ad saves
with `message_id = ''`, the listing posts, then the catch replies a second time
and throws `InteractionAlreadyReplied`. 28 of 33 post-rewrite ads are orphaned
from their Discord message. Failure rate 100%, unreported for over a year.

**The scheduler has never run a job.** Its deployed image was pushed 2025-04-19
14:27; the commit enabling the weekly screenshot winner landed 2025-04-20 09:56.
Seventeen hours, never rebuilt. Every job in the container's `config.ini` is
commented out.

**And fixing that alone wouldn't help** — `CreateScreenshotSubcommand` stores
`interaction.id` as `message_id` instead of the posted message's ID, so the
winner job fetches a non-existent message for every screenshot and always
concludes "no winner". Recoverable: the real messages exist, carry `plat`
reactions, and embed the screenshot UUID in their content.

**All 624 screenshot images are dead** (HTTP 404). The bot stored Discord's
signed CDN URLs, which expire in 24h. Recoverable from the messages, but any
future design must re-host at ingest.

**Trophies are frozen at 2024-12-02** because the psnprofiles.com scraper was
never ported from the old bot. `/trophy rank` shows a two-year-old leaderboard as
if it were current.

**The rewrite dropped Portuguese.** The old bot spoke pt-PT throughout; every
string in the TypeScript rewrite is English, in a Portuguese community.

**The brand exists, but not in the repo.** The real logo is the Discord guild
icon: a flaming gamepad-skull, white on black, four coloured face buttons.
Palette sampled: bg `#060302`, fg `#FFFFFF`, red `#EA3223`, blue `#4199E7`,
mint `#8AFBCC`, yellow `#FFFD54`. `webpage/assets/img/` contains only Bootstrap
template leftovers — `logo.png` is referenced by `index.html` and does not exist.

**The data is messy** because two bots with different conventions wrote to the
same tables: `adType` has three values for two concepts, `plataform` has 21
strings for ~7 platforms, `zone`/`price`/`state` are unvalidated free text.

**LFG tables are empty** — porting LFG is greenfield, no migration needed.

## Decisions taken (2026-08-19, at my request — "make decisions for me")

1. **Host: HTZ1**, Portainer stack `game-on-portugal`, deployed by GitHub Actions
   over the SSH tunnel, same as brawl-teams / builders-and-builds. Not the
   static-first path — the migration is happening anyway, so building twice is
   waste.
2. **Media: a new in-stack MinIO**, bucket `gop-media`, public-read, at
   `media.game-on-portugal.pt`. Separate from insight-report-studio's MinIO.
3. **Releases: release-please per component**, on merge, with Conventional
   Commits enforced on PR titles (`pr-title.yml`) — the actual root cause of
   "never released", since PRs are squash-merged and `chore:` cuts nothing.
4. **Runners: `ubuntu-latest`.** The repo is public, so hosted runners and code
   scanning are free; no dependency on ARC access this org may not have.
5. **Scheduler: delete it**, run jobs in-process in the bot — also removes a
   `/var/run/docker.sock` mount from the host running Plex and Frigate.
6. **Ad lifecycle**: 14 days idle → prompt → 72h → expire (never delete).
7. **Privacy**: display names only, never user IDs, opt-out from day one.
8. **Language**: pt-PT for all user-facing copy, English command names.
9. **Redis: dropped.** The rewritten bot never reads `REDIS_DSN`.
10. **No heuristic backfill** of the 28 orphaned ad `message_id`s.

## Next / open

Suggested order is **04 → 01 → 02 → 03**, with 03's design work parallelisable.
Plan 01 is safe to build before 04 lands (it touches no infrastructure).

What still needs me specifically (all in plan 04's runbook):

- **Repo secrets/variables**: `RELEASE_PLEASE_TOKEN` (PAT — `GITHUB_TOKEN` PRs
  don't trigger downstream workflows), `DOCKER_*`, `PORTAINER_ACCESS_TOKEN`,
  `DEPLOY_SSH_KEY`/`KNOWN_HOSTS`, `TELEGRAM_*`. Delete the `CAPROVER_*` ones.
- **HTZ1**: append a tunnel-only deploy key to `~ezweb/.ssh/authorized_keys`
  (append, never rewrite), create the Portainer stack, restore the DB dump.
- **DNS**: `game-on-portugal.pt` apex + `media` → 195.201.192.35 in the OVH zone,
  and refresh the zone. Apex only once the portal exists.
- **Confirm `DEPLOY_SSH_PORT`** — remote-hosts says 2224, the ez-web SETUP files
  say 22.
- Repo settings: squash-only merges, branch protection requiring `CI`.

Also outstanding from the earlier audit: back up `~/game-on-portugal/.env` (only
copy of the bot token and DB credentials, on a home server), verify the
`databack/mysql-backup` job actually restores, and stop `entrypoint.sh` printing
the DB root password as its first log line.

## Operational reference

- **Repo**: `github.com/GameOnPortugal/monorepo`, branch `main`. Worktree for this
  work: `.worktrees/new-task-82ca7140`, branch `luis/new-task-82ca7140`.
- **Production**: `ssh -p 2224 tedcrypto@192.168.0.184` (TedRelayer),
  `~/game-on-portugal/` — containers `game-on-portugal-{app,scheduler,db,redis,db-backup}`.
- **Credentials**: `~/game-on-portugal/.env` on that host, mode 0600. **No other
  copy exists.**
- **DB**: MariaDB 11.5.2, schema `discord-bot`. Query without exposing the
  password: `set -a; . ~/game-on-portugal/.env; set +a; docker exec
  game-on-portugal-db mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" discord-bot -e '…'`
- **Images**: Docker Hub `joshlopes/game-on-portugal-{bot,scheduler}`.
- **Discord**: guild `818108848492773377`, bot `GameOnPortugalBot#9387`.
  Channels — `📖anuncios` `818447274266591243`, `🖼screenshots`
  `827646847483904040`, `💬chat` `818447297444052993`.
- **Brand assets**: guild icon hash `b5d2486a6181a2a5ecb3a4cfbc4b9a0d`, banner
  `ffa308a0fad1a858794921dec051bad5`, both on `cdn.discordapp.com`.
- **Local dev**: Node ≥18.18 required (use nvm 24.x — system Node 18.16 fails
  Prisma's preinstall). Always `bunx prisma generate` before type checking.

## Decisions log

- **Documented in-repo rather than only here** — the plans are agent-facing work
  specs tightly coupled to the code, so they live in `docs/plans/`; this file is
  the durable overview and pointer.
- **pt-PT for all user-facing copy**, command names stay English. The community
  writes Portuguese and the old bot spoke it; the rewrite's English is a
  regression, not a decision anyone made.
- **Soft-delete over hard-delete** everywhere. The old bot destroyed rows on
  expiry, which is why nothing can be reconstructed.
- **Never store a Discord CDN URL as the durable copy of an image.** Cause of the
  dead gallery.
- **Post the message first, then persist once** with the real message ID —
  rather than the two-phase write that produced both current bugs.
- **The four brand button colours become the four platform colours** (PlayStation,
  Xbox, Nintendo, PC) across the portal — brand-native and instantly legible.
- **Recommended killing the scheduler container** rather than repairing it: its
  `update_container.py` indirection existed only to cope with CapRover's
  generated container names, which docker-compose does not have.
