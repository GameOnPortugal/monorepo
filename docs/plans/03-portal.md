# Plan 03 — Community portal

**Goal**: a public site that promotes the Game On Portugal community and shows
what it produces — the marketplace, the screenshot gallery, the trophy
leaderboard — plus an admin portal over the same data. Modern, minimalist,
game-flavoured, mobile-first.

Read [`00-overview.md`](00-overview.md) first — brand assets, palette and the
state of the data are there.

## Audience and purpose

Two distinct users, one codebase:

1. **A prospective member** who lands from social media or a search. They should
   understand what this community is within five seconds and be one tap from the
   Discord invite. This is the promotional job.
2. **An existing member** browsing the marketplace or the gallery on a phone,
   probably while in Discord. This is the utility job — and the thing that gives
   people a reason to return.

Plus **admins**, who need to moderate content and see what the bot is doing
without SSHing into a server and writing SQL.

Both public jobs are content-led, so the portal lives or dies on whether the
content looks good. Which is why plan 02's image recovery is a hard dependency.

## Brand and design direction

The identity already exists and is strong — see `00-overview.md` for the assets
and hex values. It is a white flaming gamepad-skull on near-black, a heavy brush
wordmark, and four coloured face buttons.

Design principles for this build:

- **Dark-first, not dark-mode-as-afterthought.** The brand is black. Background
  `#060302`, foreground `#FFFFFF`, with generous negative space. A light theme is
  explicitly *not* required for v1.
- **The four button colours are the platform palette.** This is the strongest
  brand-native idea available: PlayStation, Xbox, Nintendo and PC map onto the
  four face-button colours, so platform tags across the marketplace, the gallery
  and the leaderboard are instantly legible and unmistakably Game On Portugal.
  Assign the mapping once, in one place, and never vary it.
- **Type does the work.** A heavy display face for headings echoing the wordmark's
  brush weight; a clean neutral sans for body. Two families, no more.
- **Restrained "gaming" cues.** Chamfered corners, a hairline scanline texture at
  very low opacity on hero surfaces, focus states that glow rather than outline.
  Resist RGB gradients, neon everything, and animated backgrounds — the logo is
  already loud, so the interface should be quiet around it.
- **Content-forward.** Screenshots are the best asset; give them full-bleed
  treatment and let the chrome disappear.
- **Motion is functional**: page transitions and image loads only. Respect
  `prefers-reduced-motion`.

Accessibility: the brand's white-on-black is high contrast and easy to keep
compliant — but the four accents are *not* all legible as text on black
(`#FFFD54` is fine, `#EA3223` is marginal). Use accents for fills, borders and
icons; keep text white or near-white. Verify AA before shipping.

If the admin dashboard grows charts, follow the `dataviz` skill's guidance rather
than inventing a chart style.

## Architecture

Follow the house pattern already used by `brawl-teams`, `builders-and-builds` and
`insight-report-studio`: a Bun API, a React SPA, a database, optional object
storage, deployed as a Portainer stack behind Caddy.

```
portal/
  api/     Bun + Hono. Prisma client over the existing `discord-bot` schema.
  web/     React + Vite + Tailwind. SPA, static-built, served by nginx or Caddy.
```

Rationale: the bot is already Bun + TypeScript + Prisma, so the API shares the
schema, the language and the mental model; and this is the stack Luis's other
projects deploy, so the CI and hosting patterns are copy-adaptable rather than
invented.

**Schema ownership.** The bot owns the schema. The portal API reads it and
writes only through explicit, audited admin endpoints. Do not let the portal run
migrations. Either extract `prisma/` into a shared workspace package or have the
API import the bot's generated client — decide early, and write it down.

**Do not fork the data.** One database, one source of truth. A read replica is
premature at this size (70 ads, 624 screenshots, 4,971 trophies).

### Hosting — decided: HTZ1

| Option | Shape | Pros | Cons |
| ------ | ----- | ---- | ---- |
| **A** — TedRelayer + Cloudflare Tunnel | Portal next to the DB; tunnel for ingress | No data move; reuses the existing Caddy | Public traffic to a home server; residential upstream; media served from home |
| **B** — Move the stack to HTZ1 | Portal + bot + DB on the public Hetzner box | Real hosting, Caddy + Portainer + MinIO + CI deploy patterns already there | Requires migrating the live DB and bot; biggest one-off effort |
| **C** — Static export | A job publishes JSON/static pages to GitHub Pages; admin stays private over Tailscale | Cheapest, nothing exposed, `game-on-portugal.pt` already points at Pages | No live data, no public admin, no search |

**Decided: B.** See "Decisions" at the foot of this page — the stack is moving
to HTZ1 regardless ([plan 04](04-infrastructure-migration.md)), so building for
a temporary static host would be throwaway work. The table above is kept for the
reasoning, not as an open choice.

When this was written, `game-on-portugal.pt` served GitHub Pages from
`GameOnPortugal/gameonportugal.github.io` (last touched 2021). ✅ **Resolved
2026-08-21**: the apex serves this portal, that repo is archived, and this
repo's orphaned `webpage/` directory is deleted (issue #9).

### Media storage

Shared decision with plan 02, which needs somewhere to put 624 recovered
screenshots plus marketplace photos.

**Decided**: a *new* MinIO instance in the `game-on-portugal` Portainer stack
(not the one insight-report-studio uses), bucket `gop-media`, anonymous-download,
served at `https://media.game-on-portugal.pt`. Already defined in
`infrastructure/game-on-portugal.yaml`. Store the stable public URL in the
database and never a presigned one.

Budget roughly: 624 screenshots at ~2–4 MB ≈ 1.5–2.5 GB, plus growth. Generate
and store thumbnails (WebP/AVIF) at ingest — a phone should not download a 4 MB
PNG to render a grid tile.

### Auth

Discord OAuth2 for admin. The guild already has an application, members already
have Discord accounts, and admin rights can be derived from guild permissions —
so there is no user table, no password reset, and no new attack surface. Gate on
guild membership plus the **`ManageMessages` permission**, the same check the bot
uses for moderation (plan 01, decision 4), so there is one definition of "admin"
across both surfaces. Keep sessions short and server-side.

The public site needs no login in v1.

## Data normalisation

The portal is the first consumer that has to make this data presentable, and
`00-overview.md` documents how messy it is. Put the mapping in **one shared
module** used by both the bot and the portal, so a listing renders identically in
Discord and on the web:

- **Platform**: 21 stored strings → 4 canonical platforms (+ `Other`). `PS5`,
  `PlayStation 5`, `PS 5`, `PS`, `Ps Now`, `PS4`… → PlayStation, and so on.
- **Condition**: legacy Portuguese free text (`Novo/Selado`, `Como novo`,
  `Muito Bom`) folded onto the enum from plan 01.
- **Zone**: free text → district where recognisable, else `Outra`/`Online`.
- **Price**: `price_cents` from plan 01 where parseable; display the original
  string when not.

Map at display time; do not rewrite history. Historical rows are a record of what
people actually typed.

## Pages

**Public**

| Page | Content |
| ---- | ------- |
| Home | Hero (logo, wordmark, one-line pitch, Discord CTA), live stats (members, ads, screenshots, trophies), latest screenshots strip, newest listings, platform marks, socials |
| Marketplace | Grid of active ads; filters by type/platform/zone/condition/price; detail view with images, seller, and a "contact on Discord" deep link |
| Screenshots | Masonry gallery, filter by platform, lightbox; **Hall of Fame** of weekly winners — the most promotable page on the site |
| Trophies | Leaderboard with the caveat that data is frozen at 2024-12-02 until the scraper is ported; per-profile pages |
| About / Community | What the community is, the rules, the channels, how to join |

**Admin**

| Page | Content |
| ---- | ------- |
| Dashboard | Counts, recent activity, job run status |
| Ads | Table, search, edit, force-expire, delete, see orphans |
| Screenshots | Moderate, re-run relink for a row, delete |
| Trophies & profiles | Browse, ban/exclude flags (the columns already exist) |
| Jobs | Trigger a job, view last run and outcome |
| Audit log | Who changed what — new table, admin writes only |

Sitemap, OpenGraph and Twitter cards matter here: the promotional job depends on
a shared link rendering well. Use the banner as the default OG image and a
screenshot as the per-page one where sensible.

## Mobile

Mobile-first is a requirement, not a breakpoint afterthought — most members will
arrive from the Discord mobile client's in-app browser. Design the 375 px layout
first; the desktop grid is the enhancement. Test in the Discord in-app browser
specifically, which is not quite Safari or Chrome.

## Privacy

✅ **Built — GLOBAL-PLAN.md M9.7.** The portal publishes, at minimum, Discord
usernames against marketplace ads and screenshots:

- Show **display names**, never raw user IDs, in public views. — already true
  (`repositories/ads.ts`/`screenshots.ts`/`trophies.ts` never select
  `author_id`/`userId` into a public response shape).
- Offer an opt-out, and honour it in both the portal and the bot. — a new
  `PrivacySetting` table (one row per Discord member, not a flag duplicated
  onto `ads`/`screenshots`/`trophyprofiles` — see the M9.7 row for why),
  honoured by `portal/api/src/repositories/visibility.ts` (fails closed: a
  broken check hides content, never shows it) and by the bot's `/privacy
  opt-out`/`opt-in` commands.
- Do not publish anything from DMs or private channels. — unaffected; the
  portal only ever reads `ads`/`screenshots`/`trophyprofiles`, none of which
  can hold DM content.
- Add a short privacy page; the community is EU-based, so GDPR applies — a
  deletion request must remove portal content too. — `portal/web/src/pages/
  Privacy.tsx` (pt-PT, static) plus `/privacy delete-data` on the bot, which
  hard-deletes (not soft-deletes) a member's ads, screenshots and trophy
  profile. Erasure is immediate, no grace period — see the M9.7 row for why
  that is the conservative default and the question left open for Luis.

## Task breakdown

Phase A can start immediately and in parallel with plans 01–02. Phase B needs the
recovered images.

| # | Phase | Task | Acceptance |
| - | ----- | ---- | ---------- |
| 1 | A | **Vendor the brand.** Pull the guild icon + banner into `portal/web/public/brand/`, trace an SVG logo, define the design tokens (palette, type scale, spacing) in Tailwind config. | A tokens page renders the palette and type scale; no Bootstrap leftovers |
| 2 | A | ~~Decide hosting + media storage~~ — **done**, see Decisions. Instead: add `portal-api`/`portal-web` to release-please config + manifest and uncomment their services in `infrastructure/game-on-portugal.yaml`, in the same PR that creates the directories. | `release-please` opens PRs for both components; stack deploys with the new services |
| 3 | A | **Scaffold `portal/api`** (Bun + Hono) with read-only endpoints: stats, ads, screenshots, trophies. | `GET /api/stats` returns live counts from the production schema shape |
| 4 | A | **Shared normalisation module** (platform/condition/zone/price). | Unit tests cover every one of the 21 platform strings and the legacy condition strings |
| 5 | A | **Scaffold `portal/web`** (Vite + React + Tailwind), routing, layout shell, mobile-first. | Lighthouse mobile ≥90 on an empty shell |
| 6 | A | **Home page.** | Renders live stats and the Discord CTA; looks right at 375 px |
| 7 | A | **Marketplace pages** (list, filters, detail). | Filters work against real data; ads with no image degrade gracefully |
| 8 | B | **Screenshots gallery + Hall of Fame.** | Depends on plan 02 task 3; thumbnails, lightbox, lazy loading |
| 9 | A | **Trophies leaderboard**, with an honest "data frozen" notice. | Matches `/trophy rank` output for the same query |
| 10 | A | **Discord OAuth + admin shell.** | Only guild members with the admin role get in; sessions expire |
| 11 | A | **Admin CRUD + audit log.** | Every write is attributed and logged |
| 12 | A | **Admin jobs page** (wired to plan 02's runner). | An admin can dry-run the winner job and see the result |
| 13 | A | **SEO, OG cards, sitemap, analytics.** | A shared link previews with the banner and a real title |
| 14 | A | **Deploy + CI.** | Reproducible deploy; documented in `docs/operations.md` |

## Decisions (settled — do not relitigate)

1. **Hosting: option B, HTZ1.** Not the static-first path — the migration is
   happening anyway (plan 04) and building the portal twice would be wasted work.
   Deployed as part of the `game-on-portugal` Portainer stack, behind the host's
   central Caddy, via the same GitHub Actions pipeline as every other project.
2. **Media: a new in-stack MinIO**, bucket `gop-media`, public-read, at
   `https://media.game-on-portugal.pt`. Shared with plan 02. Generate WebP
   thumbnails at ingest — a phone must not download a 4 MB PNG per grid tile.
3. **Domain: `game-on-portugal.pt` apex**, replacing the 2021 GitHub Pages site,
   with `www` alongside. The repointing is phase 4 of plan 04 and happens only
   once there is a portal to serve; `GameOnPortugal/gameonportugal.github.io`
   gets archived and this repo's `webpage/` directory deleted.
4. **Language: pt-PT only** for v1. The community is Portuguese and so is the
   bot; a half-maintained English translation is worse than none. Structure the
   copy for i18n (no hardcoded strings in components) so `en` is a later
   decision, not a rewrite.
5. **Privacy: display names only, never user IDs, and an opt-out from day one.**
   A single `public_opt_out` flag honoured by both the portal and the bot, plus a
   short privacy page. The community is EU-based; a deletion request must remove
   portal content too. Cheap now, expensive to retrofit.
6. **v1 includes the admin portal.** Without it, moderation still means SSH and
   SQL — and the admin surface is what makes the portal load-bearing rather than
   a brochure. It ships behind Discord OAuth with the same `ManageMessages`
   permission check the bot uses (plan 01, decision 4).
7. **Release components**: `portal-api` and `portal-web` get added to
   `.github/release-please-config.json` and the manifest when the directories are
   scaffolded — release-please errors on a package path that does not exist, so
   add them in the same PR that creates the directories, and uncomment the two
   services in `infrastructure/game-on-portugal.yaml` in the same change.
8. **Admin sessions are a signed, stateless cookie, not a session table**
   (M8.10). `src/lib/session.ts`: an HMAC-SHA256-signed payload the server
   verifies on every request and never looks up — no new MySQL table, which
   both keeps the admin's own footnote (schema ownership is the bot's) and
   sidesteps the same constraint the audit log below hit. Rotating the
   signing secret logs out every admin at once.
9. **The admin audit log is a private SQLite file the portal owns, not a
   MySQL table** (M8.11). `discord-bot/prisma` is off-limits to the portal
   (decision above, and the schema-ownership section up top) — a new table
   there is a bot-side migration this work cannot make. Bun's built-in
   `bun:sqlite` gives durable, queryable storage with zero new dependency and
   zero touch to the bot's schema; persisted on its own Docker volume
   (`portal_audit_data`) so it survives redeploys. Trade-off recorded, not
   hidden: it is **not** covered by the existing nightly MySQL backup — a
   follow-up, not done as part of M8.11.
10. **The admin jobs page (M8.12) is read-only — no "run this job now"
    button**, contrary to this plan's own original acceptance line ("An admin
    can dry-run the winner job and see the result"). `job_runs` is written by
    the bot's in-process scheduler; nothing outside that process can trigger
    a run without a new, admin-authenticated HTTP surface on the bot itself —
    `discord-bot/src` work, and arguably its own security-reviewed item
    rather than a UI afterthought. Recorded as an open follow-up in the
    M8.12 row of `GLOBAL-PLAN.md`, not silently descoped.
11. **No analytics were added in M8.13**, despite this plan's task table
    row #13 listing it alongside SEO/OG/sitemap. `GLOBAL-PLAN.md`'s own
    M8.13 item wording dropped it, and — separately — "which tool, and does
    it need a cookie-consent banner" is a product/legal call for an
    EU-based community (see the Privacy section above) that this work isn't
    positioned to make unilaterally. Left as an open decision for Luis.
