'use strict';

/**
 * psn-fetch — a browser-backed read-only fetch proxy for PSNProfiles.
 *
 * The bot cannot fetch psnprofiles.com itself: the site is behind a
 * Cloudflare managed challenge that needs a real browser to execute, and
 * that will not clear from a datacenter IP at all. This service is the
 * narrow escape hatch — it runs a patched Chromium on a residential
 * connection, and exposes exactly one verb: "give me the HTML at this
 * psnprofiles.com URL".
 *
 * Deliberate constraints, because this is a browser reachable over HTTP:
 *
 *  - **One allowed origin.** Anything not on https://psnprofiles.com is
 *    refused before a page is opened, so a leaked token cannot turn this
 *    into an SSRF pivot into the home network.
 *  - **Bearer token required**, compared with a timing-safe equality.
 *  - **GET only, HTML out.** No POST/eval/screenshot surface.
 *  - **Serialised.** One navigation at a time behind a queue, with a
 *    minimum interval between requests. The throttle lives here rather
 *    than in the bot because the browser here owns the Cloudflare
 *    clearance cookie; two bot processes sharing this service must not be
 *    able to double the request rate against a site with no public API.
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const PORT = Number(process.env.PORT || 8791);
const TOKEN = process.env.PSN_FETCH_TOKEN || '';
const ALLOWED_ORIGIN = 'https://psnprofiles.com';
// 1.5s survives a short burst but not a real backfill: in the first
// production run Cloudflare served ~40 pages happily and then began issuing
// challenges that never cleared, on URLs it had answered minutes earlier.
// The limit is sustained volume, not any single request, so the throttle is
// the thing that has to give. 6s puts a ~1000-page catch-up at roughly 100
// minutes, which is a fine price for a job that runs unattended.
const MIN_REQUEST_INTERVAL_MS = Number(process.env.MIN_REQUEST_INTERVAL_MS || 6000);
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 60000);
const CHALLENGE_TIMEOUT_MS = Number(process.env.CHALLENGE_TIMEOUT_MS || 60000);
/** After a challenge fails, sit out this long before retrying on a fresh browser. */
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || 120000);
/** Attempts per request, including the first. Each retry gets a new browser context. */
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 2);
const PROFILE_DIR = process.env.PROFILE_DIR || '/data/profile';

if (!TOKEN) {
  console.error('PSN_FETCH_TOKEN is required');
  process.exit(1);
}

function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

/** Constant-time compare, so a wrong token cannot be discovered byte by byte. */
function tokenMatches(presented) {
  const a = Buffer.from(presented || '');
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let browserContext = null;
/** Guards against two concurrent relaunches racing for the same profile lock. */
let launching = null;
let lastRequestAt = 0;
/** Serialises navigations: each request chains onto the previous one. */
let queue = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chromium leaves `SingletonLock`/`SingletonCookie`/`SingletonSocket` in the
 * profile directory and refuses to start if they name a process that is gone.
 * Because the profile lives on a volume that outlives the container, any
 * ungraceful stop (`docker compose up` recreating this service, an OOM kill)
 * strands them and every subsequent launch fails with "Target page, context
 * or browser has been closed" — which reads like a bug in this code rather
 * than leftover state. They are only ever valid for a live browser we own, so
 * clearing them before each launch is safe.
 */
function clearStaleProfileLocks() {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      fs.rmSync(path.join(PROFILE_DIR, name), { force: true });
    } catch (error) {
      log('profile.lock-cleanup-failed', { name, error: error.message });
    }
  }
}

async function getContext() {
  if (browserContext) return browserContext;
  // Serialise launches: the queue makes concurrent requests impossible today,
  // but a relaunch racing itself would corrupt the profile in a way that is
  // very hard to diagnose.
  if (launching) return launching;

  launching = (async () => {
    clearStaleProfileLocks();
    return launchContext();
  })();

  try {
    return await launching;
  } finally {
    launching = null;
  }
}

async function launchContext() {
  // Headed (under xvfb) and persistent, both load-bearing: headless is
  // detected outright, and a persistent profile keeps the clearance cookie
  // so most requests skip the challenge entirely.
  browserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'Europe/Lisbon',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  browserContext.on('close', () => {
    log('browser.closed');
    browserContext = null;
  });

  log('browser.launched');
  return browserContext;
}

/**
 * Drops the browser so the next request starts a fresh one. Cloudflare's
 * clearance lives in the browser profile, so once it has decided this
 * session is suspicious, reusing the same context just replays the failure —
 * a relaunch is what actually re-earns clearance.
 */
async function recycleContext(reason) {
  log('browser.recycling', { reason });
  const ctx = browserContext;
  browserContext = null;
  if (ctx) {
    await ctx.close().catch(() => {});
  }
  // Chromium releases the profile lock asynchronously after close() resolves;
  // relaunching immediately hits the very stale-lock failure above.
  await sleep(3000);
  clearStaleProfileLocks();
}

async function fetchPage(url) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptFetch(url);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_ATTEMPTS) break;

      // Only a challenge failure is worth the expensive recovery; a genuine
      // 404 or a navigation error would just fail again more slowly.
      if (!/challenge did not clear/i.test(error.message)) break;

      log('fetch.retrying', { url, attempt, cooldownMs: COOLDOWN_MS });
      await recycleContext('challenge did not clear');
      await sleep(COOLDOWN_MS);
    }
  }

  throw lastError;
}

async function attemptFetch(url) {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();

  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });

    // The interstitial resolves itself; poll the title until it clears
    // rather than sleeping a fixed amount, so the common (already-cleared)
    // case stays fast.
    const deadline = Date.now() + CHALLENGE_TIMEOUT_MS;
    let title = await page.title();
    while (title.includes('Just a moment') && Date.now() < deadline) {
      await page.waitForTimeout(1500);
      title = await page.title();
    }

    if (title.includes('Just a moment')) {
      throw new Error('Cloudflare challenge did not clear');
    }

    const status = response ? response.status() : 0;
    const html = await page.content();
    return { status, html, title };
  } finally {
    await page.close().catch(() => {});
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, browser: browserContext !== null }));
    return;
  }

  if (url.pathname !== '/fetch' || req.method !== 'GET') {
    res.writeHead(404).end('not found');
    return;
  }

  const auth = req.headers.authorization || '';
  if (!tokenMatches(auth.replace(/^Bearer\s+/i, ''))) {
    log('auth.rejected', { remote: req.socket.remoteAddress });
    res.writeHead(401).end('unauthorized');
    return;
  }

  const target = url.searchParams.get('url') || '';
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }

  if (parsed.origin !== ALLOWED_ORIGIN) {
    log('origin.rejected', { target });
    res.writeHead(403).end(`only ${ALLOWED_ORIGIN} is allowed`);
    return;
  }

  queue = queue
    .then(async () => {
      const startedAt = Date.now();
      try {
        const { status, html } = await fetchPage(parsed.toString());
        log('fetch.ok', { url: target, status, ms: Date.now() - startedAt, bytes: html.length });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        log('fetch.failed', { url: target, ms: Date.now() - startedAt, error: error.message });
        // 502: the failure is upstream (challenge/navigation), not the
        // caller's request being malformed. RetryHttpClient backs off on it.
        res.writeHead(502).end(error.message);
      }
    })
    // Keep the chain alive: a rejected link would strand every later request.
    .catch(() => {});
});

server.listen(PORT, () => log('listening', { port: PORT }));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    log('shutdown', { signal });
    server.close();
    if (browserContext) await browserContext.close().catch(() => {});
    process.exit(0);
  });
}
