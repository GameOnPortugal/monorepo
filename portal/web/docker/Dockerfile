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

# nginx-unprivileged rather than the stock nginx image: the stock one starts
# its master process as root (so it can bind :80) and only drops to `nginx`
# for workers, which Trivy flags as DS-0002 "Image user should not be 'root'"
# — correctly, since a container that never needs root should not have it.
#
# This variant runs entirely as uid 101 and listens on 8080, because binding a
# port below 1024 is what required root in the first place. Nothing else has
# to change: the container is only ever reached through Caddy on the `proxy`
# network, which addresses it by service name and port, so the port number is
# an internal detail. The Caddy vhost in infrastructure/caddy/ and the
# healthcheck below both say 8080 to match.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Redundant at runtime — the base image already runs as this uid — but stated
# explicitly on purpose. Trivy's DS-0002 parses the Dockerfile as *text* and
# cannot see a USER inherited from a base image, so without this line the scan
# reports the image as root-running even though it is not. Saying it here also
# means the file answers "what user does this run as?" on its own, rather than
# by knowing which nginx variant the FROM line names.
USER 101

EXPOSE 8080

# 127.0.0.1, not `localhost`. In this image `localhost` resolves to [::1]
# first, and nginx is listening on IPv4 only: the stock image's
# 10-listen-on-ipv6-by-default.sh rewrites the vhost to add `listen [::]:...`
# at boot, but it cannot here, because as uid 101 it has no write access to
# /etc/nginx/conf.d. The result is a container that serves traffic perfectly
# while reporting itself permanently unhealthy — caught by running it, since
# an HTTP check from outside the container passes either way.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
