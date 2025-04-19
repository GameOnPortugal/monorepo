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

COPY ../ .

RUN bunx prisma generate

FROM oven/bun:1.2.10-alpine AS runtime

ARG APP_ENV=prod
ENV APP_ENV=${APP_ENV}
ENV NODE_ENV=${APP_ENV}
ENV PORT=3000

RUN apk --no-cache add mariadb-client openssl

WORKDIR /app

# Copy dependencies and application files
COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/bin ./bin

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]