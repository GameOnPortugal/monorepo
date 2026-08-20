// The portal never owns the schema — the bot does (docs/plans/03-portal.md,
// "Schema ownership"). Rather than copying discord-bot/prisma/schema.prisma
// (which would drift silently), `bun run db:generate` runs
// `prisma generate --schema=../../discord-bot/prisma/schema.prisma`, and
// Prisma's default (un-overridden) output path resolves relative to the
// schema file, not to this package — so the generated client is written into
// discord-bot/node_modules/@prisma/client, the exact same artifact the bot
// itself uses. This import reaches into it directly.
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
import { PrismaClient } from "../../../discord-bot/node_modules/@prisma/client";

export const prisma = new PrismaClient();
