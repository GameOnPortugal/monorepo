FROM oven/bun:1.2.10-alpine AS builder

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

FROM oven/bun:1.2.10-alpine AS runtime

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
