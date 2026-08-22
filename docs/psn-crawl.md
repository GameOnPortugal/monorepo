# The PSN trophy crawl

How `/trophy rank` gets its data: what runs, where it runs, why it is split
across two machines, and what to do when it breaks.

Written 2026-08-22, when the crawl was repaired after being dead since
2024-12-02.

---

## 1. What the feature is

Members register a PSNProfiles account (`/trophy profile add <url>`). A job
walks each registered profile, finds the **platinum** trophies they have
earned, converts each platinum's *rarity* into "trophy points" (TP), and
stores them. `/trophy rank` then aggregates TP per profile into a
leaderboard — monthly, since-creation and lifetime.

The rarity → TP ladder (`Domain/Trophy/TrophyPoints.ts`, inherited verbatim
from the old bot):

| Platinum rarity | TP   |
| --------------- | ---- |
| > 30.01%        | 50   |
| > 15.01%        | 100  |
| > 8.01%         | 250  |
| > 5.01%         | 500  |
| > 2.01%         | 800  |
| > 0.6%          | 1250 |
| ≤ 0.6%          | 2000 |

Rarity is read *at the time the trophy is first seen* and never revisited, so
TP is a snapshot. This matters: a platinum earned four days after a game's
launch was ultra-rare then and may be common now. Two of the six trophies
used to validate the parser show exactly this drift, and it is correct
behaviour, not a bug.

## 2. Why it is split across two machines

PSNProfiles has **no public API**, so this is a scraper — and since roughly
2025 the site sits behind a Cloudflare managed challenge. The challenge is a
JavaScript interstitial ("Just a moment…"), not a flat block, so clearing it
requires something that actually executes it.

Measured against the live site on **2026-08-21**, six pages per cell, across
all three page types the job uses:

| Client                             | HTZ1 (Hetzner) | Home connection |
| ---------------------------------- | -------------- | --------------- |
| `fetch` / curl, any User-Agent     | 0/6            | 0/6             |
| curl-impersonate (real Chrome JA3) | 0/2            | —               |
| FlareSolverr                       | 0/3 (timeouts) | —               |
| Playwright, headless               | 0/6            | —               |
| Playwright, headed under xvfb      | 0/6            | 1/6             |
| **patchright, headed under xvfb**  | 0/6            | **6/6**         |

**Two conditions must hold at once:**

1. **A patched browser.** Stock Playwright leaks automation over CDP
   (`Runtime.enable`). It clears the *first* navigation of a fresh profile
   and is challenged on every one after — which is what the misleading 1/6
   is. `patchright` closes those leaks.
2. **A non-datacenter IP.** Everything from Hetzner failed, 0/12 across both
   browsers. This is why the fetcher cannot live beside the bot.

Two theories the evidence **disproved**, recorded so nobody burns a day
re-testing them:

- **It is not TLS/JA3 fingerprinting.** curl-impersonate with a genuine
  Chrome fingerprint still got 403.
- **It is not a WebGL/GPU check.** The passing runs reported `SwiftShader`,
  i.e. software rendering, the same as several failing ones.

So the crawl runs in two halves:

```
┌─────────────────── HTZ1 (Hetzner, Portainer stack 46) ───────────────────┐
│  gop-bot                                                                 │
│    TrophiesSyncJob  ──▶  PsnProfilesTrophySource                         │
│                            └─▶ BrowserFetchHttpClient ──┐                │
│  gop-db (MariaDB)  ◀── writes trophies/flags            │                │
└─────────────────────────────────────────────────────────┼────────────────┘
                                                          │ HTTPS + bearer
                                                          ▼
                              https://tedrelayer.tail6bf1c8.ts.net/psn-fetch
                                        (Tailscale Funnel)
┌─────────────────── TedRelayer (home, residential IP) ────────────────────┐
│  gop-psn-fetch                                                           │
│    Node HTTP server ──▶ patchright Chromium (headed, xvfb, persistent)    │
│                                    └─▶ https://psnprofiles.com            │
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. The pieces

### `TrophiesSyncJob` — `discord-bot/src/Infrastructure/Job/Jobs/`

Runs every 10 minutes **when scheduled**. Per profile:

1. Fetch the profile page and read world/country rank.
   **If both ranks are absent, the profile is flagged `isBanned + isExcluded`** —
   that is how a banned or private PSN account is detected.
2. Check the linked Discord user is still in the guild. If not, flag
   `hasLeft + isExcluded`.
3. Walk the platinum list newest-first, and for each unseen trophy fetch its
   page, compute TP from rarity, and store it. In normal ("catch-up") mode it
   **stops at the first trophy already stored**, so a steady-state run is
   cheap.

Two safety mechanisms worth knowing about:

- **The moderation safety valve.** If a single run would flag more than
  `MODERATION_SAFETY_VALVE_THRESHOLD` profiles, it commits *none* of them and
  reports instead. This exists because a parser regression looks exactly like
  a mass exodus — and it earned its keep: before the 2026-08-22 fix,
  `parseProfileRank` returned null for every profile, so the first scheduled
  run would have tried to ban and exclude all 72 active members.
- **A work budget** (`--limit`, default 200) bounds the requests any single
  run makes.

### `PsnProfilesTrophySource` — `discord-bot/src/Infrastructure/Trophy/`

Parses PSNProfiles HTML with scoped regexes (no HTML-parser dependency, by
design). The three things it extracts, and the traps in each:

| What | Where | Trap |
| ---- | ----- | ---- |
| World/country rank | `<span class="rank">` in the stats block | The number is nested inside an `<a>` **and** a label `<span>`; a non-greedy match stops at the label's closing tag |
| Platinum URLs | `<tr class="platinum">` rows on the list page | — |
| Rarity + date | the platinum's `<tr>` on a trophy page | A real page has **13** `<tbody>` elements; the first two are decoys with no completion date |

Three further details that are easy to get wrong:

- **Which rarity.** Each trophy row carries *two* percentages: PSNProfiles'
  own site rarity (in `td.hover-hide`, shown by default) and Sony's global
  figure (in `td.hover-show`, revealed on hover). The TP ladder is calibrated
  against the **site rarity**. Reading the other one repriced GTA IV's
  platinum from 1250 TP to 2000.
- **Dates carry markup.** `2<sup>nd</sup> Sep 2021` must be flattened to text
  before `dayjs` sees it.
- **Comments are stripped first.** Commented-out markup is still markup to a
  regex, and these helpers all take the *first* match.

The platinum row is located by `title="Platinum"`, which appears exactly once
per page — deliberately **not** by "has a completion date", because an
unearned platinum has no date and must still be found so the job raises
`TrophyNotEarnedYet` (skipped) rather than a generic error (counted failed).

### `BrowserFetchHttpClient` — `discord-bot/src/Infrastructure/Http/`

Swaps the direct `fetch` for a call to the sidecar. Bound **only** to the
trophy source, and **only** when `PSN_FETCH_URL` and `PSN_FETCH_TOKEN` are
both set; otherwise the trophy source gets the ordinary client. That is why
the test suite and local development need no browser and no network access.

### `psn-fetch` — `infrastructure/psn-fetch/`

A ~180-line Node HTTP server wrapping one long-lived patchright Chromium.
One endpoint: `GET /fetch?url=…`. Because it is a browser reachable over
HTTP, it is deliberately narrow:

- **One allowed origin** (`https://psnprofiles.com`), checked before a page
  is opened, so a leaked token cannot make it an SSRF pivot into the home
  network.
- **Bearer token**, compared in constant time.
- **GET only**; no eval, no screenshot, no navigation to arbitrary hosts.
- **Serialised** behind a queue with a minimum 1.5s gap. The throttle lives
  here, next to the browser that owns the Cloudflare clearance cookie, so two
  bot processes cannot double the request rate against a site with no API.
- **Persistent browser profile** on a Docker volume — it keeps the clearance
  cookie, which is why a typical request takes ~1s and never sees a
  challenge.

## 4. Setup

### The sidecar (TedRelayer)

```bash
cd ~/psn-fetch                 # server.js, Dockerfile, docker-compose.yml, .env
docker compose up -d --build
docker compose logs -f
```

`.env` holds `PSN_FETCH_TOKEN` (mode 600). Published through the Tailscale
Funnel that host already had enabled, on its own path so the existing
Jellyfin route on `/` is untouched:

```bash
sudo tailscale funnel --bg --set-path /psn-fetch http://127.0.0.1:8791
tailscale serve status
```

Funnel was chosen because HTZ1 has no passwordless sudo (ruling out both a
`sshd_config` change for a reverse tunnel and a Tailscale install) and because
home ingress is deliberately closed — HTZ1 cannot reach TedRelayer's SSH at
all, which is correct and was left that way. Funnel needs no router port and
no root on HTZ1.

**This does expose the service to the public internet.** It is token-protected
and origin-locked. The tailnet-only alternative is a Tailscale sidecar
container on HTZ1 joined to `game-on-portugal_internal` plus `tailscale serve`
instead of `funnel` — more moving parts, no public exposure.

### The bot (HTZ1, Portainer stack 46)

```
PSN_FETCH_URL   = https://tedrelayer.tail6bf1c8.ts.net/psn-fetch
PSN_FETCH_TOKEN = <same token as the sidecar's .env>
```

Then, and only in this order:

```bash
# 1. Preview. Read the report — especially newlyFlagged.
docker exec gop-bot bun run:command jobs:run trophies:sync --dry-run --limit=20

# 2. If the report looks right, schedule it (every 10 minutes).
TROPHIES_SYNC_ENABLED=true
```

`trophies:sync` is always *registered* (so it can be dry-run by hand) but only
*scheduled* when that flag is `true`. Those are two different things, and
conflating them is what made the runbook impossible before 2026-08-22: the
job was absent from the runner entirely, so the dry-run command the boot log
tells you to use failed with `Unknown job`.

Announcements to the trophies channel are a **separate** opt-in:
`TROPHIES_ANNOUNCE_ENABLED=true`.

## 5. Verifying it

```bash
# Is the sidecar alive?
curl -s https://tedrelayer.tail6bf1c8.ts.net/psn-fetch/health
# {"ok":true,"browser":true}

# Can it still get through Cloudflare? (expect 2)
curl -s -H "Authorization: Bearer $PSN_FETCH_TOKEN" \
  "https://tedrelayer.tail6bf1c8.ts.net/psn-fetch/fetch?url=https%3A%2F%2Fpsnprofiles.com%2FZephyr-pt" \
  | grep -c 'World Rank'

# Did the last run go well?
docker exec gop-db sh -c 'mariadb -uroot -p$MARIADB_ROOT_PASSWORD discord-bot \
  -e "SELECT job_name,last_run_at,status,summary FROM job_runs WHERE job_name=\"trophies:sync\"\G"'
```

## 6. When it breaks

**Symptom: every profile fails, `failedProfiles` full of HTTP errors.**
The sidecar is down, unreachable, or Cloudflare has moved. Check `/health`
first, then the curl above. If the curl returns 0, re-run the comparison
table in §2 *before* assuming the parser broke — the two are easy to confuse
and the fix is completely different.

**Symptom: a large `newlyFlagged` list, or the safety valve tripped.**
Treat as a parser regression until proven otherwise. "No visible rank" is the
auto-ban signal, so anything that breaks rank parsing looks like the whole
community being banned. Do **not** clear the flags without checking a profile
page by hand; `isExcluded` has no automatic un-flagging.

**Symptom: trophies silently skipped, `changed: 0` forever.**
Likely `parsePlatinumTrophyData` raising `TrophyNotEarnedYet` for trophies
that *were* earned — i.e. it found the wrong row. Check whether PSNProfiles
added another table above the trophy list.

**Recovering from bad flags:**

```sql
-- Inspect first. Only un-flag what you have actually verified by hand.
SELECT id, psnProfile, isBanned, hasLeft, isExcluded, updatedAt
FROM trophyprofiles WHERE isExcluded = 1 ORDER BY updatedAt DESC;
```

**Re-scanning one profile from scratch** (ignores catch-up, re-walks
everything):

```bash
TROPHIES_SYNC_ALL=true TROPHIES_SYNC_PROFILE=Zephyr-pt \
  bun run:command jobs:run trophies:sync --dry-run
```

## 7. Fragility, honestly

This works by getting past bot protection that PSNProfiles chose to turn on.
It works today. It is not guaranteed to keep working, and it will need
occasional attention.

Consequences worth accepting deliberately:

- **The pinned versions are load-bearing.** The Playwright base image and the
  patchright version are pinned because the whole point of that image is a
  browser fingerprint known to clear the challenge. An unattended bump is
  exactly the change that would silently break it.
- **The sidecar must stay on a residential connection.** Moving it to any
  datacenter — including HTZ1, where everything else lives — puts it back to
  0/6.
- **It is a scraper against a site with no API.** The 1.5s serialised throttle
  and the descriptive User-Agent are deliberate; keep them.

If the crawl ever becomes unmaintainable, the fallback is Sony's official PSN
API via an NPSSO token. It was rejected here because every one of the 4,971
existing trophy rows is keyed by its psnprofiles.com URL, so switching source
means either a data migration or re-importing everything as duplicates — plus
an NPSSO token expires roughly every two months and needs manual refresh.
That trade-off may look different if the scraper starts failing weekly.

## 8. Related

- [`infrastructure/psn-fetch/README.md`](../infrastructure/psn-fetch/README.md) — sidecar specifics
- [`operations.md`](operations.md) — deploying and debugging the bot generally
- [`plans/GLOBAL-PLAN.md`](plans/GLOBAL-PLAN.md) — M7 is the trophy milestone
