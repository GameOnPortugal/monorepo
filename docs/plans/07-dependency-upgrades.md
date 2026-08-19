# Discord Bot — Dependency Upgrade Plan

**Status:** Planned, not started. Written 2026-08-19.
**Scope:** `discord-bot/` in `GameOnPortugal/monorepo`. Package manager: **Bun** (`bun.lock`, 167 transitive packages).
**Companion plans:** [modern Discord practices](06-discord-api-modernisation.md) · [bot audit](05-bot-audit-and-hardening.md)

> Moved into the repo on 2026-08-19 from `~/claude-plans/`. Sequencing is owned by
> [`GLOBAL-PLAN.md`](GLOBAL-PLAN.md); read this file for the **detail**.

---

## TL;DR

Nine direct runtime deps, three dev deps, one peer dep, 167 packages resolved. Two are a **full major version behind** (`prisma` 6→7, `dotenv` 16→17), one is ~10 minors behind (`axios`), and `discord.js` is on 14.18.0 which hard-pins `undici@6.21.1` — meaning **you cannot patch undici without bumping discord.js**. There are also two hygiene defects worth fixing before any bump: `reflect-metadata` is imported but undeclared, and `dotenv` is declared but never imported.

**Recommended order:** hygiene → low-risk patches → discord.js → axios/dotenv → **Prisma 6→7 alone, last, with the integration suite as the gate**.

---

## ⚠️ Data-quality caveat — read this first

The npm registry was **only intermittently reachable** from the environment this plan was written in (TLS interception; `npm`, `curl -k`, and `bun info` all failed for most packages). Latest versions below are marked:

- **✅ verified** — fetched live from `registry.npmjs.org` on 2026-08-19.
- **❓ unverified** — *not checked*. Do not treat the "latest" column as fact; it is blank.

Before starting, run this to fill in the table properly:

```bash
cd discord-bot
bun outdated            # or: npx npm-check-updates
```

Everything in the **"locked"** column is hard fact, read from `bun.lock`.

---

## Direct dependency inventory

| Package | Declared | Locked | Latest | Gap | Notes |
|---|---|---|---|---|---|
| `discord.js` | `^14.18.0` | **14.18.0** | ❓ | patch/minor behind 14.x | Pins `undici@6.21.1` exactly. See "The undici problem". |
| `@prisma/client` | `^6.6.0` | **6.6.0** | **7.8.0** ✅ | **1 major** | Biggest job by far. See "Prisma 6→7". |
| `prisma` (dev) | `^6.6.0` | **6.6.0** | **7.8.0** ✅ | **1 major** | Must move in lockstep with `@prisma/client`. |
| `axios` | `^1.8.4` | **1.8.4** | **1.18.1** ✅ | ~10 minors | Several 1.x security fixes landed after 1.8.4. |
| `dotenv` | `^16.5.0` | **16.5.0** | **17.4.2** ✅ | **1 major** | **Dead dependency — never imported.** Candidate for deletion, not upgrade. |
| `inversify` | `^7.5.0` | **7.5.0** | ❓ | ? | v7 is the current major line. Split into `@inversifyjs/*` packages. |
| `winston` | `^3.17.0` | **3.17.0** | ❓ | ? | Only used by `LokiLogProvider`. |
| `winston-loki` | `^6.1.3` | **6.1.3** | ❓ | ? | Drags in `snappy` + `protobufjs`. See "winston-loki weight". |
| `dayjs` | `^1.11.13` | **1.11.13** | ❓ | ? | Single use: `OrmScreenshotRepository.findByWeek`. |
| `uuid` | `^11.1.0` | **11.1.0** | ❓ | ? | Single use: `src/Domain/Id.ts`. |
| `@types/bun` (dev) | `latest` | **1.2.9** | ❓ | ? | **Unpinned `latest` spec** — non-reproducible. Local Bun is 1.3.14; types are 1.2.9. |
| `env-cmd` (dev) | `^10.1.0` | **10.1.0** | ❓ | ? | Only for `test:*` scripts. Bun can do `--env-file` natively now. |
| `typescript` (peer) | `^5` | **5.8.3** | ❓ | ? | Should be a **dev** dep, not a peer dep — this is an app, not a library. |

### Notable transitives

| Package | Locked | Why it matters |
|---|---|---|
| `undici` | **6.21.1** | Exact-pinned by `discord.js` **and** `@discordjs/rest`. Cannot be overridden safely. |
| `discord-api-types` | 0.37.120 | Ships the API v10 typings; bumps with discord.js. |
| `ws` | 8.18.1 | Gateway transport via `@discordjs/ws`. |
| `snappy` + 13 platform binaries | 7.2.2 | Native compression, pulled in **only** by `winston-loki`. |
| `protobufjs` | 7.5.0 | Also only `winston-loki`. |
| `esbuild` + 21 platform binaries | 0.25.2 | Via `@prisma/config` → `esbuild-register`. Disappears differently under Prisma 7. |
| `lodash` | 4.17.21 | Fully patched version — fine. |
| `@types/node` | 22.14.1 | Node 22 typings in a Bun project. |

---

## Hygiene defects to fix first (these are bugs, not upgrades)

**D1 — `reflect-metadata` is a phantom dependency.** It is imported for side effects in `src/Infrastructure/DependencyInjection/inversify.config.ts:1` and `src/Infrastructure/CommandHandler/CommandHandlerManager.ts:4`, but appears **nowhere** in `package.json`. It resolves today only because Inversify happens to pull it in transitively (locked at 0.2.2). The day Inversify drops or restructures that dep, the container fails to build at boot.
*Fix:* `bun add reflect-metadata` and pin it explicitly.

**D2 — `dotenv` is declared but never imported.** No file in `src/`, `bin/`, `tests/`, or `docker/` references it. Env loading actually works by accident of **Bun auto-loading `.env`**. Two consequences: (a) the dep is dead weight, and (b) anyone who assumes Node-compatibility will find env loading silently missing.
*Fix:* either delete `dotenv` and document the Bun-implicit behaviour, or import it explicitly at the entrypoint if Node portability matters. Don't upgrade 16→17 for a package you don't use.

**D3 — `@types/bun: "latest"`.** An unpinned floating spec in `devDependencies`. Every fresh `bun install` can pull a different version; the lockfile currently says 1.2.9 while the local toolchain is Bun 1.3.14.
*Fix:* pin to a real range matching the Bun version the Dockerfile uses (`oven/bun:1.2.10-alpine` — note that's *also* drifting from local 1.3.14).

**D4 — `typescript` in `peerDependencies`.** Applications don't have peers. It should be a devDependency, especially once `tsc --noEmit` runs in CI.

**D5 — Bun version drift.** Dockerfile pins `oven/bun:1.2.10-alpine`; local dev is on Bun 1.3.14. Dev and prod are on different runtimes. Pick one and pin it in both places (plus a `.bun-version` / `engines` field).

---

## The undici problem

`discord.js@14.18.0` → `@discordjs/rest@2.4.3` → `undici@6.21.1`, pinned **exactly** (no caret) in both. undici is the HTTP stack every Discord REST call goes through.

This means:
- `bun audit` findings against undici **cannot** be resolved by a transitive bump or a `resolutions`/`overrides` entry without risking an untested pairing.
- The only supported remedy is **bumping `discord.js` itself** to a release whose `@discordjs/rest` pins a newer undici.

*Action:* make "what undici does the latest 14.x pin?" the first question of the discord.js bump, and record the answer. This is the single strongest argument for keeping discord.js current even when no feature is wanted.

## winston-loki weight

`winston-loki@6.1.3` is responsible for `snappy@7.2.2` (**13 prebuilt native binaries**, one per platform) and `protobufjs@7.5.0`. That's a large native attack surface and image-size cost for what is one optional log sink, gated behind `if (!isEmpty(process.env.LOKI_HOST))`.

*Options to evaluate:* (a) keep it; (b) replace with a plain HTTP push to Loki's JSON endpoint via the existing `HttpClient` abstraction — `LogProviderInterface` already isolates this, so it's a contained change; (c) ship logs via stdout and let the platform collector scrape (CapRover/Docker), dropping the sink entirely.

Option (b) or (c) would remove ~15 packages and all native binaries. `LokiLogProvider` also has a **copy-paste bug** worth fixing while you're in there: `labels: { job: 'tedcrypto-campaign' }` — wrong project name, so this bot's logs are mislabelled in Loki.

## Prisma 6→7

The largest and riskiest single upgrade. Prisma 7 is not a drop-in.

Things in this repo that Prisma 7 touches directly:
- `prisma/schema.prisma` uses `generator client { provider = "prisma-client-js" }` with explicit `binaryTargets = ["native", "darwin", "linux-musl-arm64-openssl-3.0.x", "linux-musl-openssl-3.0.x"]`. The generator model and engine/binary-target story changed in 7 — expect this block to be rewritten.
- `PrismaClient` is constructed once as a constant value in `inversify.config.ts` and injected as `TYPES.OrmClient` into 4 repositories. Client construction/config surface changes.
- `docker/entrypoint.sh` runs `bunx prisma migrate deploy` at container start; `docker/Dockerfile` runs `bunx prisma generate` at build time with `--production` installs. Both need re-verification.
- The **integration test suite** (`tests/Integration/**`, 9 handler tests against a real MariaDB) is the natural gate — it exercises every repository.

*Plan:* standalone PR, no other changes in it. Read the official 6→7 upgrade guide, migrate the generator block, regenerate, run `bun run test:setup && bun test` against the CI MariaDB, then verify a real `migrate deploy` in a throwaway container before merging.

---

## Proposed sequencing

**Step 1 — Hygiene (no version changes).** D1–D5. Declare `reflect-metadata`, drop or wire `dotenv`, pin `@types/bun`, move `typescript` to dev, reconcile Bun versions. Low risk, unblocks everything else.

**Step 2 — Gates before touching versions.** Re-enable the commented-out static-analysis job in `.github/workflows/bot.yaml`, add `tsc --noEmit`, add `bun audit` to CI, add Renovate or Dependabot (grouped, so this never becomes a one-off project again). **Without a typecheck in CI, no dependency bump is verifiable** — the integration tests only cover the Application layer.

**Step 3 — discord.js to latest 14.x.** Should be near-mechanical, but pair it with the deprecation cleanups in the [practices plan](06-discord-api-modernisation.md) since newer 14.x releases warn loudly on `ephemeral:` and `fetchReply:`, both of which this codebase still uses. Record the resulting undici version.

**Step 4 — axios 1.8.4 → latest.** Only two files touch it (`AxiosHttpClient`, `RetryAxiosHttpClient`) behind the `HttpClient` domain port, so blast radius is tiny. Review 1.9→1.18 changelogs for `paramsSerializer`/`transformRequest` behaviour changes. *Alternative worth considering:* Bun and Node both ship `fetch` — the `HttpClient` port exists precisely so axios could be dropped entirely, removing `follow-redirects`, `form-data`, `proxy-from-env`, `combined-stream`, `mime-types`, `asynckit`.

**Step 5 — inversify / winston / dayjs / uuid.** Batch minor+patch. `dayjs` and `uuid` each have exactly one call site, so they're trivially verifiable — and both are replaceable with stdlib (`crypto.randomUUID()` for uuid; `Temporal`/date math for the one `startOf('week')` call) if you want to shed deps.

**Step 6 — winston-loki decision.** Keep / replace with HTTP / drop. Fix the `tedcrypto-campaign` label bug regardless.

**Step 7 — Prisma 6→7, alone.** As above.

---

## Standing policy (so this doesn't recur)

1. **Renovate or Dependabot**, grouped: one PR/week for patches, separate PRs for majors, `discord.js` in its own group.
2. **`bun audit` in CI**, failing on high/critical.
3. **No floating specs.** `latest` and bare `^5` are banned in `package.json`.
4. **`tsc --noEmit` on every PR** — the actual safety net for dependency bumps.
5. Pin the Bun base image and keep local + Docker in sync.

## Environment note (not repo scope, but flagged)

The workstation this plan was drafted on has npm/registry configuration issues that
affect the trustworthiness of anything installed from it — notably TLS verification
being disabled globally, which is why some registry reads succeeded here at all.
That is **not a `discord-bot` concern** and is deliberately not documented in this
public repo; it is tracked separately as a machine-configuration task outside the
repository. Anyone reproducing a dependency bump should do so on a machine with
default (verified) TLS.
