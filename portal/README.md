# Game On Portugal — Community Portal

Public/admin portal for `docs/plans/03-portal.md` (GLOBAL-PLAN milestone M8).
Two packages:

```
portal/
  api/   Bun + Hono. Reads discord-bot's Prisma schema; a small set of
         admin-only endpoints write to it (see "Admin writes" below).
  web/   Vite + React + Tailwind. Mobile-first SPA (375px baseline).
```

Landed so far, across four PRs: scaffold + CI/release-please/deploy wiring
(M8.2/M8.3/M8.5, [#48](https://github.com/GameOnPortugal/monorepo/pull/48)),
brand assets (M8.1, [#55](https://github.com/GameOnPortugal/monorepo/pull/55)),
the public pages — Home/Marketplace/Screenshots/Trophies, shared
platform/condition/zone normalisation (M8.4/M8.6-M8.9,
[#56](https://github.com/GameOnPortugal/monorepo/pull/56)) — and the admin
surface: Discord OAuth, admin CRUD + audit log, the jobs page, per-page SEO,
and deploy/CI documentation (M8.10-M8.14). See
[`docs/plans/GLOBAL-PLAN.md`](../docs/plans/GLOBAL-PLAN.md) M8 for the full
task breakdown, what's genuinely done vs. scaffold, and the M8.15 DNS cutover
that's still open.

## Admin writes (M8.11)

Until M8.10/M8.11, every query in `src/repositories/*.ts` was a `findMany`/
`findUnique`/`$queryRaw` SELECT — "read-only by convention" (see below). That
boundary still holds for those files. What changed: `src/repositories/admin/*.ts`
is a **new**, deliberately separate set of functions that write (force-expire/
soft-delete an ad, delete a screenshot, ban/exclude a trophy profile,
edit an ad's description/price/zone) — reachable **only** behind
`src/middleware/requireAdmin.ts` (`/api/admin/*`, see `src/routes/admin.ts`),
and every one of them is paired with a row in the audit log
(`src/audit/db.ts`) recording who/what/when. "Read-only" for the public
repositories is unchanged; "admin-write, always audited" is the new, narrow
exception.

The admin session itself needs no new table: it's a signed, stateless cookie
(HMAC over a JSON payload, `src/lib/session.ts`) — see that file's header for
why a session table would have hit the same "the bot owns the schema"
constraint the audit log did, and how this avoids needing one entirely.

The audit log doesn't live in MySQL either, for the same reason: a private
SQLite file this service owns outright (Bun's built-in `bun:sqlite`, zero new
dependency — see `src/audit/db.ts`'s header), persisted on its own Docker
volume in production (`infrastructure/game-on-portugal.yaml`'s
`portal_audit_data`).

**Discord OAuth + the admin definition** (M8.10) is in `src/lib/discordAuth.ts` —
gated on guild membership and the same `ManageMessages` permission bit
`discord-bot/src/Domain/Bot/AdminCheck.ts`'s `isGuildAdmin()` checks (that
file's header spells out exactly how the two stay in sync without one
importing the other). Degrades safely when unset: see
`.env.example`'s "ADMIN OAUTH" section for the three environment variables
and the Discord Developer Portal setup, and `docs/operations.md`'s "Portal
(M8)" section for exactly which secrets are still missing in production.

## Schema ownership — read this before touching `portal/api`

**The bot owns `discord-bot/prisma/schema.prisma`. The portal never copies it
and never runs a migration against it.** `portal/api` generates a Prisma
client *from* that file (`bun run db:generate`, which runs
`prisma generate --schema=../../discord-bot/prisma/schema.prisma`), and
because Prisma's default (un-overridden) client output path resolves relative
to the schema file rather than to the invoking package, the generated client
lands in `discord-bot/node_modules/@prisma/client` — the exact same artifact
the bot itself uses, not a copy. `portal/api/src/db.ts` imports it via a
relative path (`../../../discord-bot/node_modules/@prisma/client`) and that
file's header comment explains the mechanics in full.

**Practical consequence**: `discord-bot`'s `prisma` version
(`discord-bot/package.json`) and `portal/api`'s `prisma` version
(`portal/api/package.json`) must be kept in lockstep, pinned exactly (not a
`^` range) — the `prisma` CLI that runs `generate` and the `@prisma/client`
package it writes into must match, or generation fails with a missing
runtime-file error. If you bump one, bump the other in the same PR.

**Known limitation**: today the bot and the portal share one MySQL user (see
`infrastructure/game-on-portugal.yaml`'s `portal-api` service — it reuses
`MYSQL_ROOT_PASSWORD`). "Read-only" is enforced by *convention* — every query
in `portal/api/src/repositories/` uses `findMany`/`findUnique`/`$queryRaw*`
only, never a Prisma write method — not by a database grant. A read-only
MySQL user for the portal is a reasonable follow-up (not done here, to keep
this PR to the scaffold).

## Privacy

Every repository function in `portal/api/src/repositories/` builds its
`WHERE` clause through the helpers in `repositories/visibility.ts`, not
inline. `docs/plans/03-portal.md` decision 5 / GLOBAL-PLAN M9.7 plans a
`public_opt_out` column on `ads`, `screenshots` and `trophyprofiles` — it does
not exist in the schema yet (that's bot schema work, out of scope for this
agent). When it lands, honouring it is a one-line addition to those three
helper functions, not a rewrite of every route. Public responses already
never include `author_id`/`channel_id`/`message_id`/`userId` — see each
repository file's header comment.

## Local development

Prerequisites: Bun, and Node ≥18.18 on `PATH` (Prisma's preinstall hook —
same requirement as `discord-bot`, see the repo root `AGENT.md`). A MySQL/
MariaDB instance with the bot's migrations applied — the quickest path is
`discord-bot`'s own throwaway-container recipe:

```bash
docker run -d --name gop-test-mariadb \
  -e MARIADB_ROOT_PASSWORD=rootpassword -e MARIADB_DATABASE=discord_bot_test \
  -p 3399:3306 mariadb:11.7.2

cd discord-bot
bun install
DATABASE_URL='mysql://root:rootpassword@127.0.0.1:3399/discord_bot_test' bunx prisma migrate deploy
```

### API

```bash
cd portal/api
bun install
cp .env.example .env   # point DATABASE_URL at the DB above
bun run db:generate    # writes into discord-bot/node_modules/@prisma/client
bun run dev            # http://localhost:3001
```

`bun run typecheck` and `bun test` both run `db:generate` first. Tests write
and clean up their own fixture rows (`tests/helpers.ts`) against whichever
database `DATABASE_URL` points at — point it at a throwaway/test database,
never production.

Public endpoints: `GET /health`, `GET /sitemap.xml`,
`GET /api/marketplace/ads[?adType=&status=&limit=&offset=]`,
`GET /api/marketplace/ads/:id`, `GET /api/screenshots[?platform=&limit=&offset=]`,
`GET /api/trophies/leaderboard[?limit=]`, `GET /api/stats`,
`GET /api/media/thumbnail?src=<origin media URL>&w=<160|320|480>` (M8.8 — see
`src/lib/thumbnails.ts` and `src/lib/mediaAllowlist.ts`: resizes+re-encodes
an origin screenshot/ad photo to WebP and caches it on disk; `src` must be
under the `media.game-on-portugal.pt` / `gop-media` bucket allowlist and `w`
must be one of the three fixed widths, or the request is refused with 400).

Auth: `GET /api/auth/config`, `GET /api/auth/login`, `GET /api/auth/callback`,
`GET /api/auth/me`, `POST /api/auth/logout` — all 503 when OAuth env vars are
unset (`src/lib/discordAuth.ts`'s `loadOAuthConfig()`).

Admin (`src/routes/admin.ts`, all behind `requireAdmin` — 401 without a valid
session, 503 when OAuth is unconfigured): `GET /api/admin/dashboard`,
`GET/PATCH /api/admin/ads[/:id]`, `POST /api/admin/ads/:id/expire`,
`DELETE /api/admin/ads/:id`, `GET /api/admin/screenshots`,
`DELETE /api/admin/screenshots/:id`, `GET/PATCH /api/admin/trophy-profiles[/:id]`,
`GET /api/admin/jobs`, `GET /api/admin/audit-log`.

### Web

```bash
cd portal/web
bun install
cp .env.example .env.local   # VITE_API_URL=http://localhost:3001 for local dev
bun run dev                  # http://localhost:5173
```

`bun run typecheck` (`tsc -b`) and `bun run build` (`tsc -b && vite build`).

In production the web container's nginx proxies `/api/` and `/health` to
`portal-api` internally (see `portal/web/docker/nginx.conf` and
`infrastructure/caddy/game-on-portugal.pt.caddy`), so the public site is
single-origin — `VITE_API_URL` is a local-dev-only override, never set at
container build time. See `src/lib/api/client.ts`.

## Design tokens (M8.5)

Defined once, in `portal/web/src/index.css`'s `@theme` block (Tailwind v4,
CSS-first config) — palette, two type families (self-hosted via
`@fontsource`, not a third-party CDN), chamfered-corner and scanline
utilities, and a `prefers-reduced-motion` global override. See
`docs/plans/03-portal.md` "Brand and design direction" for the reasoning.

The platform → colour mapping (PlayStation/Xbox/Nintendo/PC → the four brand
accents) is defined exactly once, in `portal/web/src/lib/platforms.ts` — that
file's header comment records the assignment and the WCAG contrast numbers
that back the "accents are fills/borders/icons, never text on black" rule.
Every future page must import `PLATFORMS`/`PlatformBadge` from there rather
than re-deriving the mapping.

## Admin: what's real vs. what's a follow-up

- **Real, tested, working**: Discord OAuth login gated on guild membership +
  `ManageMessages` (M8.10); ads (edit/force-expire/soft-delete, including an
  orphan filter for the known `message_id IS NULL` bug), screenshots
  (delete), and trophy-profile (ban/exclude) admin CRUD, each one writing a
  row to the audit log (M8.11); a read-only jobs page over the real
  `job_runs` table (M8.12); per-page OG/Twitter tags and a live
  `sitemap.xml` (M8.13).
- **No "run this job now" button (M8.12)**: `job_runs` is written by the
  bot's own in-process scheduler; there is no HTTP surface on the bot to
  trigger a job on demand, and adding one is `discord-bot/src` work out of
  this agent's scope (see `src/repositories/admin/jobs.ts`'s header and the
  M8.12 row in `GLOBAL-PLAN.md` for the decision written up in full).
- **No public URL yet**: `game-on-portugal.pt`'s apex still serves the 2021
  GitHub Pages site. That's **M8.15**, a deliberate DNS + Caddy change for
  Luis to make — see `docs/operations.md`'s "Portal (M8)" section.
- **Two secrets are still missing in the Portainer stack env**:
  `DISCORD_CLIENT_SECRET` and `SESSION_SECRET`. Until both are set, admin
  login is unreachable (`503`) and the rest of the site is unaffected — see
  `.env.example`'s "ADMIN OAUTH" section for exactly what to create and
  where.
- **Not done, recorded as follow-ups, not silently skipped**: a dedicated
  read-only MySQL user for the portal (see "Known limitation" above); the
  bot adopting the shared normalisation module bot-side (M8.4 landed
  portal-only in [#56](https://github.com/GameOnPortugal/monorepo/pull/56));
  a nightly backup of the new `portal_audit_data` volume (today only the
  bot's MySQL schema is backed up, see `docs/operations.md`).
