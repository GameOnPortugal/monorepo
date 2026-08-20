# Build context MUST be the repo root, not portal/api — this image needs
# discord-bot/prisma/schema.prisma (to generate a Prisma client, never to run
# a migration) as well as portal/api itself:
#
#   docker build -f portal/api/docker/Dockerfile .
#
# See portal/api/src/db.ts for why: this package deliberately does not copy
# discord-bot's schema (docs/plans/03-portal.md "Schema ownership" — the bot
# owns it, the portal only reads it), so the generated client has to be
# produced from the bot's own `prisma`/`@prisma/client` install (kept in
# lockstep by version — see portal/README.md) and then carried into the
# runtime image next to portal/api's own code, at the same relative path
# (../../../discord-bot/node_modules/@prisma/client from src/db.ts) that
# local development uses.

FROM oven/bun:1.2.10-alpine AS bot-prisma

RUN apk --no-cache add openssl
WORKDIR /repo/discord-bot

# Only what `bun install` + `prisma generate` need — not the bot's full
# source tree, and this stage is discarded after generation.
COPY discord-bot/package.json discord-bot/bun.lock ./
RUN bun install --frozen-lockfile
COPY discord-bot/prisma ./prisma
# No DATABASE_URL is set or needed: `generate` reads the schema, it does not
# connect to a database and never runs a migration.
RUN bunx prisma generate

FROM oven/bun:1.2.10-alpine AS api-build

WORKDIR /repo/portal/api
COPY portal/api/package.json portal/api/bun.lock ./
# --production: this package's `prisma`/`typescript` devDependencies are only
# needed for `db:generate`/`typecheck`, which already ran (bot-prisma stage)
# or run in CI, not in the shipped image.
RUN bun install --frozen-lockfile --production
COPY portal/api/src ./src

FROM oven/bun:1.2.10-alpine AS runtime

RUN apk --no-cache add openssl \
    && addgroup -S app \
    && adduser -S app -G app -h /home/app

WORKDIR /app

COPY --from=api-build --chown=app:app /repo/portal/api/node_modules ./portal/api/node_modules
COPY --from=api-build --chown=app:app /repo/portal/api/src ./portal/api/src
COPY --from=api-build --chown=app:app /repo/portal/api/package.json ./portal/api/package.json
# The generated client, not the bot's schema/source — see file header.
COPY --from=bot-prisma --chown=app:app /repo/discord-bot/node_modules/@prisma ./discord-bot/node_modules/@prisma
COPY --from=bot-prisma --chown=app:app /repo/discord-bot/node_modules/.prisma ./discord-bot/node_modules/.prisma

ENV HOME=/home/app
ENV PORT=3001
USER app

WORKDIR /app/portal/api

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["bun", "run", "src/index.ts"]
