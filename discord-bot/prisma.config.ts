import { defineConfig } from 'prisma/config';

// Prisma 7 moved the datasource connection URL (and the migrations path,
// previously implicit) out of schema.prisma and into this file. See
// docs/plans/07-dependency-upgrades.md "Prisma 6→7" and the M3.6 row in
// docs/plans/GLOBAL-PLAN.md for why this file exists.
//
// Deliberately `process.env.DATABASE_URL` here, not the `env()` helper
// `prisma/config` also exports: `env()` throws immediately if the variable
// is unset, at config-load time, before Prisma even knows which subcommand
// is running. `docker/Dockerfile`'s builder stage runs `bunx prisma
// generate` at *build* time, when DATABASE_URL isn't set yet (it's supplied
// at container boot) — `generate` never needs a live connection, only
// `migrate`/`db push` do, so this must stay lazy the way schema.prisma's own
// `env("DATABASE_URL")` used to be.
export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: process.env.DATABASE_URL,
    },
});
