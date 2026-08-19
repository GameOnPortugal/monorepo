# discord-bot

The Discord bot for the **Game On Portugal** community
(`GameOnPortugalBot#9387`). TypeScript + [Bun](https://bun.sh) +
discord.js v14 + Prisma/MySQL, layered Domain/Application/Infrastructure/Ui.

Read the repo-root `CLAUDE.md` first — it's the agent-facing guide to the whole
monorepo. Deeper docs live in `../docs/` (start at `../docs/architecture.md` and
`../docs/plans/GLOBAL-PLAN.md`).

## Install

Node **≥ 18.18** is required by Prisma's preinstall hook (use nvm's 24.x if the
system Node is older — `bun install` fails silently otherwise).

```bash
bun install
```

## Type check

```bash
bunx prisma generate   # REQUIRED first — without it tsc reports ~30 phantom errors
bunx tsc --noEmit
```

`bun run typecheck` does both in one step.

## Run

```bash
cp .env.example .env   # fill in DISCORD_TOKEN, DATABASE_URL, etc.
bun run dev             # watch mode
bun run start           # no watch
```

Without `DISCORD_TOKEN` set, the DI container binds an in-memory Discord client
instead of a real one — useful for tests, surprising in dev.

## Tests

Integration tests run against a real MariaDB. Either via docker-compose:

```bash
make up && make db.test.setup && make tests
```

or against a throwaway container:

```bash
docker run -d --name gop-test-mariadb \
  -e MARIADB_ROOT_PASSWORD=rootpassword -e MARIADB_DATABASE=discord_bot_test \
  -p 3399:3306 mariadb:11.7.2
export DATABASE_URL='mysql://root:rootpassword@127.0.0.1:3399/discord_bot_test'
bunx prisma db push --skip-generate
bun test
```

More `make` targets: `make help`.

## More

- Agent/contributor guide: `../CLAUDE.md`
- Architecture: `../docs/architecture.md`
- Known issues and the work queue: `../docs/known-issues.md`,
  `../docs/plans/GLOBAL-PLAN.md`
