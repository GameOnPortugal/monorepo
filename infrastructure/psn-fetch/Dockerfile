# Chromium and its system libraries come from the Playwright base image;
# patchright drives a patched build of the same browser. Pinned rather than
# :latest because the whole point of this image is a browser fingerprint that
# is known to clear the challenge — an unattended base bump is exactly the
# kind of change that would silently break it.
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# xvfb is load-bearing, not a convenience: headless Chromium is detected and
# refused, so the browser runs headed against a virtual display.
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb tini \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev && npx patchright install chromium

COPY server.js ./

ENV PORT=8791 \
    PROFILE_DIR=/data/profile

# /data holds the persistent browser profile — and with it the Cloudflare
# clearance cookie, which is what keeps most requests from being challenged
# at all. Losing it is survivable but makes the first requests after a
# restart much slower.
VOLUME ["/data"]

EXPOSE 8791

# tini reaps the Chromium children xvfb-run leaves behind; without it a
# long-lived container accumulates zombies.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1440x900x24", "node", "/app/server.js"]
