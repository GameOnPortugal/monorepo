# Build context is portal/web (unlike portal/api's Dockerfile) — the web
# package has no dependency on discord-bot at build time, only on
# portal-api's HTTP surface at runtime (see docker/nginx.conf).
#
#   docker build -f portal/web/docker/Dockerfile portal/web

FROM oven/bun:1.2.10-alpine AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# No VITE_API_URL build-arg on purpose — see src/lib/api/client.ts for why
# the production default is same-origin "/api", not a baked-in host.
RUN bun run build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost/ || exit 1
