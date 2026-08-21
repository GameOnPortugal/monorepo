# Pinned at 1.3.14, not the previous 1.2.10: Prisma 7's `prisma` package
# preinstall hook hard-requires Node 20.19+/22.12+/24.0+, and 1.2.10's
# bundled Node-compat version (v22.6.0) fails that check, aborting the
# `bun install` build step outright. 1.3.14 reports v24.3.0 and is also
# what local dev already runs (see CLAUDE.md's D5 note on Bun version
# drift) — matching it here removes one axis of dev/prod mismatch instead
# of adding a third version to the mix. See docs/plans/GLOBAL-PLAN.md M3.6.
FROM oven/bun:1.3.14-alpine AS builder

ARG APP_ENV=prod
ENV APP_ENV=${APP_ENV}

RUN apk --no-cache add mariadb-client openssl

WORKDIR /app

COPY package.json bun.lock ./
RUN if [ "$APP_ENV" = "prod" ]; then \
        bun install --frozen-lockfile --production; \
    else \
        bun install --frozen-lockfile; \
    fi

COPY . .

RUN bunx prisma generate

FROM oven/bun:1.3.14-alpine AS runtime

ARG APP_ENV=prod
ENV APP_ENV=${APP_ENV}
ENV NODE_ENV=${APP_ENV}
ENV PORT=3000

# mariadb-client is still required here: docker/entrypoint.sh shells out to
# the `mariadb` CLI to poll DB readiness before running `prisma migrate
# deploy`. Do not drop it without replacing that check.
RUN apk --no-cache add mariadb-client openssl \
    && addgroup -S app \
    && adduser -S app -G app -h /home/app

WORKDIR /app

# Copy dependencies and application files, owned by the unprivileged user so
# they (and anything Prisma/Bun writes at runtime under $HOME) stay
# readable/writable without running as root.
COPY --from=builder --chown=app:app /app/package.json /app/bun.lock ./
# entrypoint.sh runs `bunx prisma migrate deploy` on every boot (see below);
# Prisma 7 requires prisma.config.ts to be present wherever the CLI runs,
# not just at generate/build time.
COPY --from=builder --chown=app:app /app/prisma.config.ts ./
# Load-bearing at runtime, not just for `tsc`: tsconfig.json's `paths` alias
# is what makes every `from '@prisma/client'` import resolve to the
# generated client in prisma/generated/ instead of node_modules/@prisma/client
# (whose own re-export target, node_modules/.prisma/client, only exists
# under the old prisma-client-js generator). Bun's runtime reads this file
# for the same `paths` resolution `bun run src/index.ts` needs below — drop
# it and the container starts, then crashes on the first Prisma import.
COPY --from=builder --chown=app:app /app/tsconfig.json ./
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/src ./src
COPY --from=builder --chown=app:app /app/bin ./bin

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV HOME=/home/app
USER app

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]

FROM runtime AS test

# Copy everything for test (test and test env files). Briefly regain root to
# own the copied tree, then drop back to the unprivileged user.
USER root
COPY --chown=app:app . ./
USER app

ENTRYPOINT ["/entrypoint.sh"]
