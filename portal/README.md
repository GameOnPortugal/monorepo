# Game On Portugal — Community Portal

Scaffold for `docs/plans/03-portal.md` (GLOBAL-PLAN milestone M8). Two
packages:

```
portal/
  api/   Bun + Hono. Read-only endpoints over discord-bot's Prisma schema.
  web/   Vite + React + Tailwind. Mobile-first SPA (375px baseline).
```

This PR (M8.2/M8.3/M8.5) scaffolds both packages, wires CI/release-please/deploy,
and builds one representative page (Home) so the pages in M8.6-M8.13 have a
pattern to copy. It does **not** build the Marketplace/Screenshots/Trophies/
Admin pages — that is separate, later work. See
[`docs/plans/GLOBAL-PLAN.md`](../docs/plans/GLOBAL-PLAN.md) M8 for the full
task breakdown and what has and hasn't landed.

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

Endpoints: `GET /health`, `GET /api/marketplace/ads[?adType=&status=&limit=&offset=]`,
`GET /api/marketplace/ads/:id`, `GET /api/screenshots[?platform=&limit=&offset=]`,
`GET /api/trophies/leaderboard[?limit=]`.

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

## What is NOT in this PR

- **M8.1 (brand assets)**: no logo/icon files. `portal/web/public/favicon.svg`
  is a plain placeholder and the header wordmark is text
  (`font-display`), not a traced SVG. The next agent needs to pull the real
  guild icon
  (`https://cdn.discordapp.com/icons/818108848492773377/b5d2486a6181a2a5ecb3a4cfbc4b9a0d.png?size=512`)
  and banner
  (`https://cdn.discordapp.com/banners/818108848492773377/ffa308a0fad1a858794921dec051bad5.png?size=1024`),
  trace an SVG logo, and vendor them into `portal/web/public/brand/`. This
  agent could not fetch/trace binary image assets from a text-only tool
  loadout.
- **M8.4 (shared normalisation module)**: `portal/api`'s ads/screenshots
  repositories and `portal/web`'s `guessPlatform()` both do minimal, local,
  best-effort mapping with an explicit comment pointing at M8.4 — neither is
  the real shared module the bot and portal are both supposed to depend on.
- **M8.6-M8.13** (the rest of the pages, OAuth admin, SEO): Home is a
  representative skeleton only, not the finished page from M8.6.
- A dedicated read-only MySQL user for the portal (see "Known limitation"
  above).
