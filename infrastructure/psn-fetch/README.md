# psn-fetch

A browser-backed, read-only fetch proxy for `psnprofiles.com`. It exists for
one reason: **the bot cannot fetch PSNProfiles itself any more.**

## The problem

PSNProfiles sits behind a Cloudflare managed challenge. It is not an IP ban —
it is a JavaScript interstitial ("Just a moment…"), so clearing it needs
something that actually executes the challenge. Measured against the live site
on **2026-08-21**, six pages per cell, across all three page types the sync
job uses (profile, platinum list, trophy detail):

| Client                             | HTZ1 (Hetzner) | TedRelayer (home) |
| ---------------------------------- | -------------- | ----------------- |
| `fetch` / curl, any User-Agent     | 0/6            | 0/6               |
| curl-impersonate (real Chrome JA3) | 0/2            | —                 |
| FlareSolverr                       | 0/3 (timeouts) | —                 |
| Playwright, headless               | 0/6            | —                 |
| Playwright, headed under xvfb      | 0/6            | 1/6               |
| **patchright, headed under xvfb**  | 0/6            | **6/6**           |

Two conditions have to hold **at the same time**, which is why every simpler
fix failed:

1. **A patched browser.** Stock Playwright leaks automation over CDP
   (`Runtime.enable`). It clears the *first* navigation of a fresh profile and
   is challenged on every one after — hence the misleading 1/6. `patchright`
   closes those leaks.
2. **A non-datacenter IP.** Hetzner's range failed 0/12 regardless of client.
   This is the reason this service cannot live next to the bot on HTZ1.

Two plausible theories that the evidence **killed**, recorded so nobody
re-tests them: TLS/JA3 impersonation alone changed nothing, and the passing
runs were software-rendered (SwiftShader), so it is not a WebGL/GPU check.

## Where it runs, and how the bot reaches it

The service runs on **TedRelayer** (home network) and is published through the
Tailscale Funnel that host already had enabled, on a dedicated path:

```
https://tedrelayer.tail6bf1c8.ts.net/psn-fetch  ->  127.0.0.1:8791
```

Chosen over the alternatives because HTZ1 has no passwordless sudo (so no
`sshd_config` change for a reverse tunnel, and no Tailscale install), and
because home ingress is deliberately closed — HTZ1 cannot reach TedRelayer's
SSH at all, which is correct and was left alone. Funnel needs no inbound port
on the router and no root on HTZ1.

**This does put the service on the public internet**, so it is hardened
accordingly: bearer token compared in constant time, a hard allowlist of one
origin (`https://psnprofiles.com`), `GET` only, and no eval/screenshot
surface. If you would rather it were not public, the alternative is a
Tailscale sidecar container on HTZ1 joined to `game-on-portugal_internal` plus
`tailscale serve` (tailnet-only) instead of Funnel — more moving parts, no
public exposure.

## Operating it

```bash
# on TedRelayer
cd ~/psn-fetch
docker compose up -d --build
docker compose logs -f

curl -s https://tedrelayer.tail6bf1c8.ts.net/psn-fetch/health
curl -s -H "Authorization: Bearer $PSN_FETCH_TOKEN" \
  "https://tedrelayer.tail6bf1c8.ts.net/psn-fetch/fetch?url=https%3A%2F%2Fpsnprofiles.com%2FZephyr-pt" \
  | grep -c 'World Rank'   # expect 2

# remove the public route again
sudo tailscale serve --https=443 --set-path /psn-fetch off
```

The token lives in `~/psn-fetch/.env` (mode 600) on TedRelayer and in the bot's
environment as `PSN_FETCH_TOKEN`. Rotating it means changing both.

## Politeness

Requests are serialised behind a queue with a minimum 1.5s gap, and the
throttle lives **here** rather than in the bot on purpose: the browser in this
container owns the Cloudflare clearance cookie, so two bot processes sharing
this service must not be able to double the request rate against a site with
no public API. The persistent profile volume keeps that cookie across
restarts, which is why most requests never see a challenge at all (~1s).

## Known fragility

This depends on beating bot protection that PSNProfiles deliberately turned
on. It works today; it is not guaranteed to keep working, and the pinned base
image and pinned patchright version are load-bearing — an unattended bump is
exactly the kind of change that would silently break the fingerprint. If the
sync starts failing wholesale, re-run the table above before assuming the
parser broke.

**This host is scheduled for decommission on 2026-09-02** (GLOBAL-PLAN M2.5)
and its NVMe has 2,200+ unrecoverable read errors. The service is stateless
apart from the browser profile, so it can move to any always-on machine on a
residential connection — but if TedRelayer goes away without this moving, the
leaderboard silently stops updating again.
