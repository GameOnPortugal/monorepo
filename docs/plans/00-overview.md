# Revival programme — plan index

Each plan below is written to be handed to an agent working independently; read
this page first for the shared context and the dependencies between them.

> **Sequencing lives in [`GLOBAL-PLAN.md`](GLOBAL-PLAN.md)**, not here. That file
> is the master work queue: it folds every plan below — plus `known-issues.md`
> and `discord-bot-feature-gap.md` — into one ordered set of numbered work items.
> These plans hold the *design*; the global plan holds the *order*.

| Plan                                                       | Owner-agent scope                              | Depends on |
| ---------------------------------------------------------- | ---------------------------------------------- | ---------- |
| [01 — Marketplace overhaul](01-marketplace-overhaul.md)    | `/marketplace` end to end: correctness + UX     | —          |
| [02 — Scheduler & lifecycle](02-scheduler-and-lifecycle.md)| Job runner, ad bump/expiry, screenshot recovery | 01, 04     |
| [03 — Community portal](03-portal.md)                      | Public site + admin portal                      | 02, 04     |
| [04 — Infrastructure migration](04-infrastructure-migration.md) | TedRelayer → HTZ1, Portainer, CI/CD, releases | —      |
| [05 — Bot audit & hardening](05-bot-audit-and-hardening.md) | Security (A1–A8), correctness (B1–B10), API (C1–C7) findings | — |
| [06 — Discord API modernisation](06-discord-api-modernisation.md) | Deprecations, deferred replies, components, registration | 05 |
| [07 — Dependency upgrades](07-dependency-upgrades.md) | Version inventory, hygiene defects, Prisma 6→7 | — |

Plan 04's repo-side work is **already built and lint-clean** in this branch —
workflows, composite actions, release-please config, the Portainer stack file and
the Caddy vhosts. What remains there is a credentials-and-DNS runbook.

## Shared context every agent needs

- Read [`../../AGENT.md`](../../AGENT.md) first, then
  [`../architecture.md`](../architecture.md). The DI container is the composition
  root: **nothing is reachable until it is bound in `inversify.config.ts`**.
- Production is **live** on TedRelayer (`ssh -p 2224 tedcrypto@192.168.0.184`,
  stack at `~/game-on-portugal/`). Real users, real data. See
  [`../operations.md`](../operations.md).
- **CI does not deploy** (it targets a decommissioned host). Shipping means
  building an image and running `docker compose pull && up -d` by hand.
- Before claiming done: `bun run typecheck && bun test` (the script runs
  `prisma generate` for you). Both are **clean as of 2026-08-19** and `ci.yml`
  enforces the type check, so a PR that does not compile cannot merge.

## The community

**Portuguese-speaking.** The old bot spoke Portuguese throughout ("Qual o nome do
artigo?", "VENDO", "Preço", "Zona"). The TypeScript rewrite is entirely in
English ("New Sale Listing", "Condition", "Dispatch"). Members still post in
Portuguese in the channels. Every plan below treats **pt-PT user-facing copy as a
requirement, not a nice-to-have.** Command and subcommand *names* stay English —
they are already registered with Discord and English verbs are the platform
convention — but everything a member reads should be Portuguese.

Guild `818108848492773377` — "Game On Portugal". Relevant channels:

| Channel        | ID                   | Note                                       |
| -------------- | -------------------- | ------------------------------------------ |
| `📖anuncios`   | `818447274266591243` | The real marketplace channel (62 ads)      |
| `💬chat`       | `818447297444052993` | Has 5 stray ads — see plan 01              |
| `🖼screenshots`| `827646847483904040` | Already in `DiscordChannels.SCREENSHOTS`   |

Trophy emoji IDs in `DiscordEmoji.ts` were verified correct against the live
guild (`plat` = `820982755927392297`, and the three metals). Do not "fix" them.

## Brand assets (for plan 03, useful context for all)

Pulled from the live guild — this is the real identity, not the Bootstrap
template leftovers in `webpage/`:

- **Icon**: `https://cdn.discordapp.com/icons/818108848492773377/b5d2486a6181a2a5ecb3a4cfbc4b9a0d.png?size=512`
  — a flaming gamepad shaped like a skull, white line-art on black, with four
  coloured face buttons.
- **Banner**: `https://cdn.discordapp.com/banners/818108848492773377/ffa308a0fad1a858794921dec051bad5.png?size=1024`
  — logo above a heavy brush wordmark **GAME ON / PORTUGAL**, and
  "SUPPORTED BY:" with PC / PlayStation / Xbox / Switch marks.
- **Palette**, sampled from the icon:

  | Role       | Hex       |
  | ---------- | --------- |
  | Background | `#060302` |
  | Foreground | `#FFFFFF` |
  | Accent 1   | `#EA3223` (red)   |
  | Accent 2   | `#4199E7` (blue)  |
  | Accent 3   | `#8AFBCC` (mint)  |
  | Accent 4   | `#FFFD54` (yellow)|

- **Socials**: `discord.gg/mBJKUhwE23`, `t.me/gameonportugal`,
  `@gameonportugal` on Twitter/Instagram/Twitch,
  `facebook.com/gameonportugalofficial`.

> There is **no logo file in this repo**. `webpage/assets/img/logo.png` is
> referenced by `index.html` but does not exist, and `apple-touch-icon.png` is
> the Bootstrap logo. Plan 03 should vendor the guild icon/banner into the repo
> as proper assets (and ideally trace an SVG).

## Data reality — read before designing anything

Checked against production on 2026-08-19. The data is messier than the schema
suggests, because two bots with different conventions wrote to the same tables.

**`ads`** — 70 rows.

| Column    | Reality                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `adType`  | `sell` 35 (old bot), `sale` 28 (new bot), `wanted` 7 — **three values for two concepts** |
| `state`   | Means *condition*, not lifecycle. Mixed: enum values (`new` 26, `like_new`, `used_good`) **and** free Portuguese text (`Novo/Selado` 8, `Como novo`, `Muito Bom`, `Qualquer um`, `Versão digital`, even `Não`) |
| `zone`    | Free text, unnormalised: `Lisboa`, `porto`, `Lisbon`, `Braga/Porto`, `Digital`, `não se aplica`, and `PlayStation 4/5` (someone answered the wrong question) |
| `price`   | Free text: `145`, `65`, `50€`, … no currency discipline                 |
| `message_id` | 28 of 33 post-rewrite ads hold `''` — see plan 01                    |
| `channel_id` | 62 in `📖anuncios`, 5 in `💬chat`, 3 elsewhere                       |

**`screenshots`** — 624 rows, and **every single image URL is dead (HTTP 404)**.
614 are plain `cdn.discordapp.com/attachments/…` (from the old bot, now requiring
signatures Discord did not then issue) and 10 are `ephemeral-attachments/…`.
`plataform` is free text with 21 distinct values for ~7 real platforms
(`PS5` 400, `PlayStation 5` 75, `PS 5`, `PS`, `Ps Now`, `X box series S`,
`XBOX SERIE X - 60FPS`…).

They are **recoverable** — see plan 02.

**`trophies`** — 4,971 rows (corrected from an earlier estimate of 4,477 during
the 2026-08-19 HTZ1 migration's `SELECT COUNT(*)` verification — the 4,477
figure came from an InnoDB row-count estimate, not an exact count), frozen
since 2024-12-02 (the scraper was never ported). `trophyprofiles` — 118 rows.

**LFG tables** — all empty. No migration concern, no continuity either.

## Cross-cutting decisions already made

These are settled; agents should not relitigate them without raising it.

1. **pt-PT for all user-facing copy.** Use discord.js localisations where the API
   supports them.
2. **Soft-delete, don't hard-delete.** The portal (plan 03) wants history, and
   the old bot's habit of destroying rows is why nothing can be reconstructed.
   Add lifecycle status columns rather than `DELETE`.
3. **Never store a Discord CDN URL as the durable copy of an image.** They
   expire. Re-host to object storage at ingest. This is why the gallery is empty.
4. **Store the ID of the message you actually posted**, not `interaction.id` and
   not a placeholder to be filled in later. Both current bugs are this mistake.
5. **Schema changes need a migration** (`make db.diff NAME=…`) because the
   production entrypoint runs `prisma migrate deploy` at boot. Also fix the
   existing drift (issue #1) as part of the first migration that touches `ads`.
6. **Production is moving to HTZ1** (plan 04) — Portainer stack
   `game-on-portugal`, deployed by GitHub Actions on merge to `main`, with
   release-please cutting versions. Stop assuming the TedRelayer docker-compose
   is where things land.
7. **Media lives in MinIO**: bucket `gop-media`, public-read, at
   `https://media.game-on-portugal.pt`. Every user-visible image — screenshots,
   marketplace photos — is re-hosted there at ingest. Never store a Discord CDN
   URL as the durable copy (see decision 3).
8. **Conventional Commits are enforced** on PR titles (`pr-title.yml`), because
   PRs are squash-merged and release-please reads those messages. `chore:` does
   not cut a release — the repo's 30-commit `chore:` streak is why nothing ever
   released. Use `feat:` / `fix:` when you mean it, and scope it
   (`feat(marketplace): …`).

## Suggested order

**Plan 04 first**, at least through its phase 3 cutover — it is the foundation
the others deploy onto, and doing the screenshot recovery before the migration
would mean writing recovered images into storage that is about to be replaced.

Then plan 01 (self-contained, fixes something failing for users today), then
plan 02, whose screenshot-recovery job unblocks plan 03's gallery. Plan 03 is the
largest and its design and scaffolding can run in parallel throughout, but its
Screenshots page cannot be finished until 02 lands.

If plan 04 stalls on credentials, plan 01 is still safe to build and ship the old
way (build image, `docker compose pull` on TedRelayer) — it touches no
infrastructure.
