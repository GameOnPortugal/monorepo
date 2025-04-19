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

FROM bun_base AS app_base

# Create a non-root user to run the application
RUN addgroup --system --gid 1001 bunuser \
    && adduser --system --uid 1001 --ingroup bunuser bunuser

# Copy built application from builder stage
COPY --from=builder --chown=bunuser:bunuser /app ./

RUN bunx prisma generate



FROM app_base AS dev

ENV NODE_ENV=development
ENV APP_ENV=dev

RUN bun install -g env-cmd

RUN bunx prisma generate

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

FROM app_base AS prod

ENV NODE_ENV=production
ENV APP_ENV=prod

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER bunuser

ENTRYPOINT ["/entrypoint.sh"]