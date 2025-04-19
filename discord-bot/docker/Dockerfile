FROM oven/bun:1.2.5-alpine AS bun_base

RUN apk --no-cache add mariadb-client openssl

WORKDIR /app

COPY package.json bun.lock ./

ENV PORT=3000

EXPOSE 3000

FROM bun_base AS builder

RUN bun install --frozen-lockfile

COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json ./
COPY node_modules ./node_modules

FROM bun_base AS app_base

# Copy built application from builder stage
COPY --from=builder --chown=bunuser:bunuser /app ./

FROM app_base AS dev

ENV NODE_ENV=development
ENV APP_ENV=dev

RUN bun install -g env-cmd prisma

RUN bunx prisma generate

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

FROM app_base AS prod

ENV NODE_ENV=production
ENV APP_ENV=prod

RUN bunx prisma generate

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]