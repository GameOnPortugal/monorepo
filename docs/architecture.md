# `discord-bot/` architecture

Layered, DDD-flavoured, CQRS-ish. The rules are consistent enough that following
the existing shape will nearly always produce the right answer.

## Layers

```
src/
  Domain/          entities, value objects, repository *interfaces*, domain errors
  Application/     Query/ and Write/ — a command object + its handler, per use case
  Infrastructure/  Prisma repositories, discord.js adapters, HTTP, logging, DI
  Ui/Cli/          console commands (invoked via bin/console.ts)
```

Dependencies point inwards: `Domain` imports nothing framework-y, `Application`
imports `Domain`, `Infrastructure` imports both and is the only layer that knows
about Prisma, discord.js or axios.

## Composition root

`src/Infrastructure/DependencyInjection/inversify.config.ts` is a single
imperative container. Everything — repositories, handlers, subcommands, the bot
client, the CLI command — is bound there by hand.

**If it is not bound in that file, it does not exist at runtime.** This is the
single most common way to add code that silently never runs.

Service identifiers are symbols in `types.ts`. Two are multi-bound:
`TYPES.CommandHandler` (every application handler) and `TYPES.SlashCommandHandler`
(every top-level slash command). `TYPES.MentionHandler` is `@multiInject`ed by
`BotExecutor` but currently has zero bindings — that is fine, Inversify 7 yields
an empty array (verified, not assumed).

The container branches on environment:

```ts
if (process.env.DISCORD_TOKEN) {
    myContainer.bind(TYPES.Bot).toConstantValue(new DiscordBot(...))
} else {
    myContainer.bind(TYPES.Bot).toConstantValue(new InMemoryClient())
}
```

This is what lets the integration tests boot the whole container without Discord
credentials. It is also a foot-gun in production: a missing or misnamed
`DISCORD_TOKEN` yields a process that starts happily and does nothing.

## Two dispatchers

**`CommandHandlerManager`** (`Infrastructure/CommandHandler/`) maps application
commands to handlers **by constructor name**. `handle(new DeleteAd(...))` looks
for a handler whose name is `DeleteAdHandler`. Consequences: the naming
convention `<Command>` → `<Command>Handler` is load-bearing, and minification
would break it (Bun runs the TS directly, so this is currently safe).

**`BotExecutor`** (`Infrastructure/Bot/`) maps an incoming interaction to a slash
command handler by comparing `handler.getName()` to the interaction's command
name, then throws `BotExecutorError` if none matches.

## Anatomy of a use case

Take marketplace ad deletion, which touches every layer:

| Layer            | File                                                       | Role                                    |
| ---------------- | ---------------------------------------------------------- | --------------------------------------- |
| Domain           | `Domain/Marketplace/Ad.ts`, `AdId.ts`                      | Entity + ID value object                |
| Domain           | `Domain/Marketplace/AdRepository.ts`                       | Interface the application depends on    |
| Domain           | `Domain/Marketplace/UnauthorizedAdDeletion.ts`             | Domain error                            |
| Application      | `Application/Write/Marketplace/DeleteAd/DeleteAd.ts`       | The command (a dumb data holder)        |
| Application      | `…/DeleteAd/DeleteAdHandler.ts`                            | The behaviour                           |
| Infrastructure   | `Infrastructure/Orm/OrmAdRepository.ts`                    | Prisma implementation of the interface  |
| Infrastructure   | `…/SlashCommand/Marketplace/DeleteAdSubcommand.ts`         | discord.js adapter: parse, call, reply  |
| Infrastructure   | `…/SlashCommand/Marketplace/MarketplaceSlashCommand.ts`    | Builder + subcommand routing            |
| DI               | `inversify.config.ts`                                      | Four bindings                           |
| Test             | `tests/Integration/Application/Write/Marketplace/DeleteAd/`| Integration test mirroring the src path |

To add a use case, copy that list.

## Value objects

`Domain/AbstractStringVo.ts` is the base for `AdId`, `ScreenshotId`, `TrophyId`,
`TrophyProfileId`. They validate on construction and throw `InvalidId`. Bare
strings do not cross layer boundaries; IDs do.

## Persistence

Prisma over MySQL/MariaDB, schema at `prisma/schema.prisma`. The schema is a
faithful port of the old Sequelize models, which is why:

- Columns are snake_case (`author_id`, `channel_id`) while the domain is
  camelCase — repositories translate.
- Every model carries an explicit `@@map` to the legacy table name
  (`ads`, `screenshots`, `trophyprofiles`, `lfggames`, …).
- There is a typo preserved from the original: `Screenshot.plataform`.
- Seven models (`LFGProfile`, `LFGGame`, `LFGParticipation`, `LFGEvent`,
  `StockUrls`, `SpecialChannel`, `CommandChannelLink`) exist with **no
  repository and no code touching them** — placeholders for features not yet
  ported from `old-discord-bot/`.

Two migrations exist (`20250416170150_init`, `20250416170855_image_as_text`).
`docker/entrypoint.sh` runs `prisma migrate deploy` on every container start,
after waiting for the database to answer `SELECT 1`.

## Discord adapter

A top-level slash command class implements `SlashCommandHandler`: `getName()`,
`builder()` (a discord.js `SlashCommandBuilder` describing subcommands and
options), and `handle(context)` which dispatches to an injected subcommand class.
`DiscordBot.registerSlashCommands()` collects every bound handler's builder and
`PUT`s them to `Routes.applicationCommands(clientId)` — a **global** registration,
so changes can take up to an hour to propagate.

Channel and emoji IDs are hardcoded enums in
`Infrastructure/Community/Discord/DiscordChannels.ts` and `DiscordEmoji.ts`,
mapped from framework-free `Domain/Community/` enums. The domain-side indirection
is nice; the hardcoding means a second guild or a channel move requires a code
change and redeploy.

## Logging

`LoggerManager` fans out to providers. `ConsoleLogProvider` is always on;
`LokiLogProvider` (Winston + `winston-loki`) is added only when `LOKI_HOST` is
set, with optional `LOKI_AUTH`.

## HTTP

`Domain/Http/HttpClient.ts` interface, implemented by `AxiosHttpClient` and
wrapped by `RetryAxiosHttpClient` (which is what `TYPES.HttpClient` binds to).
Nothing in the current feature set actually calls it — it is scaffolding left
for the un-ported psnprofiles.com scraping.

## Tests

`tests/Integration/**` mirrors `src/` and drives the **real container against a
real database**. `tests/Helper/DatabaseUtil.ts` truncates the four live tables
between tests (with `FOREIGN_KEY_CHECKS=0`); `tests/Helper/StaticFixtures.ts`
provides `createAd`, `createScreenshot`, `createTrophyProfile`, `createTrophy`,
`createTrophySetup`. There are no unit tests and no Discord-layer tests — the
discord.js adapters are entirely uncovered, which is exactly where the two
merged bugfix PRs landed.
