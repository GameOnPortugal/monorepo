FROM oven/bun:1.2.5-alpine AS bun_base

RUN apk --no-cache add mariadb-client openssl

WORKDIR /app

COPY package.json bun.lock ./

ENV PORT=3000

EXPOSE 3000

FROM bun_base AS builder

COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./

FROM bun_base AS app_base

# Copy built application from builder stage
COPY --from=builder --chown=bunuser:bunuser /app ./

FROM app_base AS dev

ENV NODE_ENV=development
ENV APP_ENV=dev

RUN bun install -g env-cmd prisma && bun install

RUN bunx prisma generate

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

FROM app_base AS prod

ENV NODE_ENV=production
ENV APP_ENV=prod

RUN bun installl --frozen-lockfile

RUN bunx prisma generate

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]