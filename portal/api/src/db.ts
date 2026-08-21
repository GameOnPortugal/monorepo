// The portal never owns the schema — the bot does (docs/plans/03-portal.md,
// "Schema ownership"). Rather than copying discord-bot/prisma/schema.prisma
// (which would drift silently), `bun run db:generate` runs
// `prisma generate --schema=../../discord-bot/prisma/schema.prisma`, and
// the output path resolves relative to the schema file, not to this package
// — so the generated client is the exact same artifact the bot itself uses.
// This import reaches into it directly.
//
// Prisma 7 (M3.6) moved that artifact: it is now plain TypeScript under
// `discord-bot/prisma/generated/` rather than inside
// `discord-bot/node_modules/@prisma/client`. The generated file still imports
// `@prisma/client/runtime/client` internally, which is why the bot's
// `@prisma/client` package is carried into the runtime image beside it (see
// docker/Dockerfile).
//
// Practical consequence: `discord-bot`'s `prisma` devDependency version and
// this package's must be kept in lockstep (see package.json comment-in-README)
// — Prisma's generated client and the `prisma` CLI that wrote it must match,
// or `generate` fails with a missing-runtime-file error.
//
// This client is READ-ONLY by convention, not by a database grant (the bot
// and the portal share one MySQL user today — see portal/README.md "Known
// limitations"). Every query function in src/repositories/ must only ever
// call `findMany`/`findUnique`/`$queryRaw` SELECTs. Nothing in this package
// may call `prisma migrate *`, `prisma db push`, or any Prisma write method.
import { PrismaClient } from "../../../discord-bot/prisma/generated/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Prisma 7 requires a driver adapter — `new PrismaClient()` with no adapter
// throws at construction. `PrismaMariaDb` wraps the pure-JS `mariadb` driver,
// matching how the bot builds its own client
// (discord-bot/src/Infrastructure/DependencyInjection/inversify.config.ts),
// so both services reach MySQL the same way.
//
// Still constructed eagerly at module load. `DATABASE_URL` is required for
// this service to do anything at all — unlike the bot's optional Discord
// token there is no useful degraded mode for a read-only API over a database
// it cannot reach — so failing loudly at boot is correct, and the deploy
// health gate turns that into a failed deploy rather than a silent outage.
const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);

export const prisma = new PrismaClient({ adapter });
