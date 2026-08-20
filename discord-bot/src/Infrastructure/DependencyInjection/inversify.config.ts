import 'reflect-metadata';
import { Container } from 'inversify';
import CommandHandlerManager from '../CommandHandler/CommandHandlerManager';
import { TYPES } from './types';
import { PrismaClient } from '@prisma/client';
import ConsoleLogProvider from '../Logger/ConsoleLogProvider';
import LoggerManager from '../../Application/Logger/LoggerManager';
import { isEmpty } from '../../Application/Shared/StringTools.ts';
import LokiLogProvider from '../Logger/LokiLogProvider.ts';
import type Logger from '../../Application/Logger/Logger.ts';
import EventDispatcher from '../../Application/Event/EventDispatcher/EventDispatcher.ts';
import type { HttpClient } from '../../Domain/Http/HttpClient.ts';
import RetryHttpClient from '../Http/RetryHttpClient.ts';
import FetchHttpClient from '../Http/FetchHttpClient.ts';
import type { TrophySource } from '../../Domain/Trophy/TrophySource.ts';
import { PsnProfilesTrophySource } from '../Trophy/PsnProfilesTrophySource.ts';
import { PingHandler } from '../../Application/Query/Ping/PingHandler.ts';
import { DiscordBot } from '../Bot/Discord/DiscordBot.ts';
import { BotExecutor } from '../Bot/BotExecutor.ts';
import { PingSlashCommand } from '../Bot/Discord/SlashCommand/PingSlashCommand.ts';
import { ScreenshotSlashCommand } from '../Bot/Discord/SlashCommand/Screenshot/ScreenshotSlashCommand.ts';
import { CreateScreenshotHandler } from '../../Application/Write/Screenshot/CreateScreenshot/CreateScreenshotHandler.ts';
import OrmScreenshotRepository from '../Orm/OrmScreenshotRepository.ts';
import { GetScreenshotsHandler } from '../../Application/Query/Screenshot/GetScreenshots/GetScreenshotsHandler.ts';
import { DeleteScreenshotHandler } from '../../Application/Write/Screenshot/DeleteScreenshot/DeleteScreenshotHandler.ts';
import { ListScreenshotSubcommand } from '../Bot/Discord/SlashCommand/Screenshot/ListScreenshotSubcommand.ts';
import { CreateScreenshotSubcommand } from '../Bot/Discord/SlashCommand/Screenshot/CreateScreenshotSubcommand.ts';
import { DeleteScreenshotSubcommand } from '../Bot/Discord/SlashCommand/Screenshot/DeleteScreenshotSubcommand.ts';
import { OrmTrophyRepository } from '../Orm/OrmTrophyRepository.ts';
import { OrmTrophyProfileRepository } from '../Orm/OrmTrophyProfileRepository.ts';
import { CreateProfileHandler } from '../../Application/Write/Trophy/CreateProfile/CreateProfileHandler.ts';
import { TrophySlashCommand } from '../Bot/Discord/SlashCommand/Trophy/TrophySlashCommand.ts';
import { CreateTrophyProfileSubcommand } from '../Bot/Discord/SlashCommand/Trophy/CreateTrophyProfileSubcommand.ts';
import { GetProfileHandler } from '../../Application/Query/Trophy/GetProfile/GetProfileHandler.ts';
import { CheckTrophyProfileSubcommand } from '../Bot/Discord/SlashCommand/Trophy/CheckTrophyProfileSubcommand.ts';
import { GetRankHandler } from '../../Application/Query/Trophy/GetRank/GetRankHandler.ts';
import { RankSubcommand } from '../Bot/Discord/SlashCommand/Trophy/RankSubcommand.ts';
import { OrmAdRepository } from '../Orm/OrmAdRepository.ts';
import type { AdRepository } from '../../Domain/Marketplace/AdRepository.ts';
import { CreateAdHandler } from '../../Application/Write/Marketplace/CreateAd/CreateAdHandler.ts';
import { DeleteAdHandler } from '../../Application/Write/Marketplace/DeleteAd/DeleteAdHandler.ts';
import { DeleteAdSubcommand } from '../Bot/Discord/SlashCommand/Marketplace/DeleteAdSubcommand.ts';
import { MarketplaceSlashCommand } from '../Bot/Discord/SlashCommand/Marketplace/MarketplaceSlashCommand.ts';
import { SellSubcommand } from '../Bot/Discord/SlashCommand/Marketplace/SellSubcommand.ts';
import { ListUserAdsHandler } from '../../Application/Query/Marketplace/ListUserAds/ListUserAdsHandler';
import { ListAdsSubcommand } from '../Bot/Discord/SlashCommand/Marketplace/ListAdsSubcommand';
import { GetScreenshotWinnerHandler } from '../../Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinnerHandler';
import type { GuildClient } from '../../Domain/Community/GuildClient.ts';
import { DiscordGuildClient } from '../Community/Discord/DiscordGuildClient.ts';
import WeekScreenshotWinner from '../../Ui/Cli/WeekScreenshotWinner.ts';
import { InMemoryClient } from '../Bot/InMemory/InMemoryClient.ts';
import type { JobStateRepository } from '../../Domain/Job/JobStateRepository.ts';
import OrmJobStateRepository from '../Orm/OrmJobStateRepository.ts';
import type { JobReporter } from '../../Domain/Job/JobReporter.ts';
import { DiscordJobReporter } from '../Job/DiscordJobReporter.ts';
import { JobRunner } from '../Job/JobRunner.ts';
import { RunJobConsoleCommand } from '../Job/RunJobConsoleCommand.ts';
import { WeekScreenshotWinnerJob } from '../Job/Jobs/WeekScreenshotWinnerJob.ts';
import { DiscordChannels } from '../Community/Discord/DiscordChannels.ts';
import { InMemoryGuildClient } from '../Community/InMemory/InMemoryGuildClient.ts';
import type { MediaStorage } from '../../Domain/Media/MediaStorage.ts';
import { S3MediaStorage } from '../Media/S3MediaStorage.ts';
import { InMemoryMediaStorage } from '../Media/InMemoryMediaStorage.ts';
import { requireEnv, validateBaseEnv, validateBotEnv } from '../Config/env.ts';

const myContainer = new Container();

// Env (M1.3) — DATABASE_URL is required by every entry point that imports
// this file (src/index.ts, bin/console.ts, the whole test suite via
// myContainer), so it is validated eagerly here and the process exits(1)
// with every problem listed if it is missing. DISCORD_TOKEN /
// DISCORD_CLIENT_ID are deliberately NOT validated this way — see
// src/Infrastructure/Config/env.ts for why, and src/index.ts for where that
// validation actually happens.
const baseEnv = requireEnv(validateBaseEnv());

// Logger
myContainer.bind(ConsoleLogProvider).toSelf();

const loggerManager = new LoggerManager();
loggerManager.addProvider(myContainer.get(ConsoleLogProvider));
if (!isEmpty(baseEnv.LOKI_HOST)) {
    loggerManager.addProvider(new LokiLogProvider(String(baseEnv.LOKI_HOST), baseEnv.LOKI_AUTH));
}
myContainer.bind<Logger>(TYPES.Logger).toConstantValue(loggerManager.createLogger({}));

// Repositories
myContainer.bind<PrismaClient>(TYPES.OrmClient).toConstantValue(new PrismaClient());
myContainer.bind(TYPES.ScreenshotRepository).to(OrmScreenshotRepository).inSingletonScope();
myContainer.bind(TYPES.TrophyRepository).to(OrmTrophyRepository).inSingletonScope();
myContainer.bind(TYPES.TrophyProfileRepository).to(OrmTrophyProfileRepository).inSingletonScope();
myContainer.bind<AdRepository>(TYPES.AdRepository).to(OrmAdRepository).inSingletonScope();

// Command Handlers
myContainer.bind(TYPES.CommandHandler).to(PingHandler);
myContainer.bind(TYPES.CommandHandler).to(CreateScreenshotHandler);
myContainer.bind(TYPES.CommandHandler).to(GetScreenshotsHandler);
myContainer.bind(TYPES.CommandHandler).to(DeleteScreenshotHandler);
myContainer.bind(TYPES.CommandHandler).to(CreateProfileHandler);
myContainer.bind(TYPES.CommandHandler).to(GetProfileHandler);
myContainer.bind(TYPES.CommandHandler).to(GetRankHandler);
myContainer.bind(TYPES.CommandHandler).to(CreateAdHandler);
myContainer.bind(TYPES.CommandHandler).to(ListUserAdsHandler);
myContainer.bind(TYPES.CommandHandler).to(DeleteAdHandler);
myContainer.bind(TYPES.CommandHandler).to(GetScreenshotWinnerHandler);

// Slash Commands
myContainer.bind(TYPES.SlashCommandHandler).to(PingSlashCommand);
myContainer.bind(TYPES.SlashCommandHandler).to(ScreenshotSlashCommand);
myContainer.bind(TYPES.SlashCommandHandler).to(TrophySlashCommand);
myContainer.bind(TYPES.SlashCommandHandler).to(MarketplaceSlashCommand);

// Subcommands
myContainer.bind(CreateScreenshotSubcommand).toSelf();
myContainer.bind(ListScreenshotSubcommand).toSelf();
myContainer.bind(DeleteScreenshotSubcommand).toSelf();
myContainer.bind(CreateTrophyProfileSubcommand).toSelf();
myContainer.bind(CheckTrophyProfileSubcommand).toSelf();
myContainer.bind(RankSubcommand).toSelf();
myContainer.bind(SellSubcommand).toSelf();
myContainer.bind(ListAdsSubcommand).toSelf();
myContainer.bind(DeleteAdSubcommand).toSelf();

// Writes
myContainer.bind<CommandHandlerManager>(CommandHandlerManager).toSelf();

// Events
// myContainer.bind(TYPES.EventHandler).to(OnCartsItemsUpdatedHandler)
myContainer.bind<EventDispatcher>(EventDispatcher).toSelf();

// Factories

// Security

// Services
myContainer.bind(FetchHttpClient).toSelf();
myContainer.bind(RetryHttpClient).toSelf();
myContainer.bind<HttpClient>(TYPES.HttpClient).to(RetryHttpClient);
myContainer.bind<TrophySource>(TYPES.TrophySource).to(PsnProfilesTrophySource);

// Bot
// M1.3: DISCORD_TOKEN / DISCORD_CLIENT_ID are required for the live bot
// process, but this file is also imported by bin/console.ts and by the
// entire test suite (via `myContainer`), neither of which sets a Discord
// token on purpose — that absence is what makes InMemoryClient bind below
// instead of a real Discord.Client. So this validates but does NOT exit(1)
// on failure (unlike baseEnv above); only src/index.ts — the actual bot
// process — calls validateBotEnv() again and exits(1) if it's missing.
const botEnv = validateBotEnv();

// Mirrors the Bot binding below, and combines what M4.5 and M6.4 each needed
// from this binding. A DiscordGuildClient is only ever constructed with a
// real token — M4.5 made it fail fast rather than silently build an invalid
// REST client, so handing it `undefined` here would just move that failure to
// first use. Without a token, tests and local runs get an in-memory
// stand-in instead, which is what makes the M6.4 winner job's
// tie / vanished-message / dry-run behaviour assertable without a mocking
// library.
if (botEnv.config) {
    myContainer
        .bind<GuildClient>(TYPES.GuildClient)
        .toConstantValue(
            new DiscordGuildClient(botEnv.config.DISCORD_TOKEN, myContainer.get(TYPES.Logger)),
        );
} else {
    myContainer.bind<GuildClient>(TYPES.GuildClient).to(InMemoryGuildClient).inSingletonScope();
}
myContainer.bind(BotExecutor).toSelf();
if (botEnv.config) {
    myContainer
        .bind(TYPES.Bot)
        .toConstantValue(
            new DiscordBot(
                botEnv.config.DISCORD_TOKEN,
                botEnv.config.DISCORD_CLIENT_ID,
                myContainer.get(TYPES.Logger),
                myContainer.get(BotExecutor),
                botEnv.config.DISCORD_DEV_GUILD_ID,
            ),
        );
} else {
    // Explicit and loud (M1.3), not a silent accident: InMemoryClient is a
    // deliberate no-op escape hatch for the test suite and bin/console.ts,
    // never for the live bot process — which fails fast instead, see
    // src/index.ts.
    myContainer
        .get<Logger>(TYPES.Logger)
        .warn(
            'DISCORD_TOKEN/DISCORD_CLIENT_ID not set — binding InMemoryClient (no-op bot, no Discord connection). ' +
                'Expected for the test suite and bin/console.ts. If you are running the actual bot process ' +
                '(src/index.ts) and see this, your environment is misconfigured — it validates these ' +
                'independently at boot and should have already exited(1).',
        );
    myContainer.bind(TYPES.Bot).toConstantValue(new InMemoryClient());
}

// Media storage (M6.0) — falls back to an in-memory no-op when S3_* isn't
// configured (local dev, tests), same shape as the Bot fallback above.
if (
    process.env.S3_ENDPOINT &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY
) {
    myContainer.bind<MediaStorage>(TYPES.MediaStorage).toConstantValue(
        new S3MediaStorage({
            endpoint: process.env.S3_ENDPOINT,
            publicUrl: process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT,
            bucket: process.env.S3_BUCKET,
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
        }),
    );
} else {
    myContainer.bind<MediaStorage>(TYPES.MediaStorage).toConstantValue(new InMemoryMediaStorage());
}

// Console Command
myContainer.bind(WeekScreenshotWinner).toSelf();

// Jobs (M6.1, M6.8) — an in-process replacement for the deleted `scheduler/`
// container. Register a new job here alongside its dependencies; it becomes
// both scheduled (via JobRunner.start(), wired in src/index.ts) and manually
// runnable (`bun run:command jobs:run <name>`) with no other wiring needed.
myContainer
    .bind<JobStateRepository>(TYPES.JobStateRepository)
    .to(OrmJobStateRepository)
    .inSingletonScope();
myContainer
    .bind<JobReporter>(TYPES.JobReporter)
    .toConstantValue(
        new DiscordJobReporter(
            myContainer.get(TYPES.GuildClient),
            myContainer.get(TYPES.Logger),
            DiscordChannels.ADMIN,
        ),
    );
myContainer.bind(JobRunner).toSelf().inSingletonScope();
myContainer.bind(WeekScreenshotWinnerJob).toSelf();
myContainer.bind(RunJobConsoleCommand).toSelf();

myContainer.get(JobRunner).register(myContainer.get(WeekScreenshotWinnerJob));

export { myContainer };
