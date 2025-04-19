import 'reflect-metadata'
import { Container } from 'inversify'
import CommandHandlerManager from '../CommandHandler/CommandHandlerManager'
import { TYPES } from './types'
import { PrismaClient } from '@prisma/client'
import ConsoleLogProvider from '../Logger/ConsoleLogProvider'
import LoggerManager from '../../Application/Logger/LoggerManager'
import {isEmpty} from "../../Application/Shared/StringTools.ts";
import LokiLogProvider from '../Logger/LokiLogProvider.ts'
import type Logger from '../../Application/Logger/Logger.ts'
import EventDispatcher from "../../Application/Event/EventDispatcher/EventDispatcher.ts";
import type {HttpClient} from "../../Domain/Http/HttpClient.ts";
import RetryAxiosHttpClient from "../Http/RetryAxiosHttpClient.ts";
import AxiosHttpClient from "../Http/AxiosHttpClient.ts";
import {PingHandler} from "../../Application/Query/Ping/PingHandler.ts";
import {DiscordBot} from "../Bot/Discord/DiscordBot.ts";
import {BotExecutor} from "../Bot/BotExecutor.ts";
import {PingSlashCommand} from "../Bot/Discord/SlashCommand/PingSlashCommand.ts";
import {ScreenshotSlashCommand} from "../Bot/Discord/SlashCommand/Screenshot/ScreenshotSlashCommand.ts";
import {CreateScreenshotHandler} from "../../Application/Write/Screenshot/CreateScreenshot/CreateScreenshotHandler.ts";
import OrmScreenshotRepository from "../Orm/OrmScreenshotRepository.ts";
import {GetScreenshotsHandler} from "../../Application/Query/Screenshot/GetScreenshots/GetScreenshotsHandler.ts";
import {DeleteScreenshotHandler} from "../../Application/Write/Screenshot/DeleteScreenshot/DeleteScreenshotHandler.ts";
import {ListScreenshotSubcommand} from "../Bot/Discord/SlashCommand/Screenshot/ListScreenshotSubcommand.ts";
import {CreateScreenshotSubcommand} from "../Bot/Discord/SlashCommand/Screenshot/CreateScreenshotSubcommand.ts";
import {DeleteScreenshotSubcommand} from "../Bot/Discord/SlashCommand/Screenshot/DeleteScreenshotSubcommand.ts";
import {OrmTrophyRepository} from "../Orm/OrmTrophyRepository.ts";
import {OrmTrophyProfileRepository} from "../Orm/OrmTrophyProfileRepository.ts";
import {CreateProfileHandler} from "../../Application/Write/Trophy/CreateProfile/CreateProfileHandler.ts";
import {TrophySlashCommand} from "../Bot/Discord/SlashCommand/Trophy/TrophySlashCommand.ts";
import {CreateTrophyProfileSubcommand} from "../Bot/Discord/SlashCommand/Trophy/CreateTrophyProfileSubcommand.ts";
import {GetProfileHandler} from "../../Application/Query/Trophy/GetProfile/GetProfileHandler.ts";
import {CheckTrophyProfileSubcommand} from "../Bot/Discord/SlashCommand/Trophy/CheckTrophyProfileSubcommand.ts";
import {GetRankHandler} from "../../Application/Query/Trophy/GetRank/GetRankHandler.ts";
import {RankSubcommand} from "../Bot/Discord/SlashCommand/Trophy/RankSubcommand.ts";
import { OrmAdRepository } from "../Orm/OrmAdRepository.ts";
import type { AdRepository } from "../../Domain/Marketplace/AdRepository.ts";
import { CreateAdHandler } from "../../Application/Write/Marketplace/CreateAd/CreateAdHandler.ts";
import { DeleteAdHandler } from "../../Application/Write/Marketplace/DeleteAd/DeleteAdHandler.ts";
import { DeleteAdSubcommand } from "../Bot/Discord/SlashCommand/Marketplace/DeleteAdSubcommand.ts";
import { MarketplaceSlashCommand } from "../Bot/Discord/SlashCommand/Marketplace/MarketplaceSlashCommand.ts";
import { SellSubcommand } from "../Bot/Discord/SlashCommand/Marketplace/SellSubcommand.ts";
import { ListUserAdsHandler } from "../../Application/Query/Marketplace/ListUserAds/ListUserAdsHandler";
import { ListAdsSubcommand } from "../Bot/Discord/SlashCommand/Marketplace/ListAdsSubcommand";
import { GetScreenshotWinnerHandler } from "../../Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinnerHandler";
import type {GuildClient} from "../../Domain/Community/GuildClient.ts";
import {DiscordGuildClient} from "../Community/Discord/DiscordGuildClient.ts";
import WeekScreenshotWinner from "../../Ui/Cli/WeekScreenshotWinner.ts";

const myContainer = new Container()

// Logger
myContainer.bind(ConsoleLogProvider).toSelf()

const loggerManager = new LoggerManager()
loggerManager.addProvider(myContainer.get(ConsoleLogProvider))
if (!isEmpty(process.env.LOKI_HOST)) {
  loggerManager.addProvider(new LokiLogProvider(
    String(process.env.LOKI_HOST),
    isEmpty(process.env.LOKI_AUTH) ? undefined : String(process.env.LOKI_AUTH)
  ))
}
myContainer.bind<Logger>(TYPES.Logger).toConstantValue(loggerManager.createLogger({}))

// Repositories
myContainer.bind<PrismaClient>(TYPES.OrmClient).toConstantValue(new PrismaClient())
myContainer.bind(TYPES.ScreenshotRepository).to(OrmScreenshotRepository).inSingletonScope()
myContainer.bind(TYPES.TrophyRepository).to(OrmTrophyRepository).inSingletonScope()
myContainer.bind(TYPES.TrophyProfileRepository).to(OrmTrophyProfileRepository).inSingletonScope()
myContainer.bind<AdRepository>(TYPES.AdRepository).to(OrmAdRepository).inSingletonScope()

// Command Handlers
myContainer.bind(TYPES.CommandHandler).to(PingHandler)
myContainer.bind(TYPES.CommandHandler).to(CreateScreenshotHandler)
myContainer.bind(TYPES.CommandHandler).to(GetScreenshotsHandler)
myContainer.bind(TYPES.CommandHandler).to(DeleteScreenshotHandler)
myContainer.bind(TYPES.CommandHandler).to(CreateProfileHandler)
myContainer.bind(TYPES.CommandHandler).to(GetProfileHandler)
myContainer.bind(TYPES.CommandHandler).to(GetRankHandler)
myContainer.bind(TYPES.CommandHandler).to(CreateAdHandler)
myContainer.bind(TYPES.CommandHandler).to(ListUserAdsHandler)
myContainer.bind(TYPES.CommandHandler).to(DeleteAdHandler)
myContainer.bind(TYPES.CommandHandler).to(GetScreenshotWinnerHandler)

// Slash Commands
myContainer.bind(TYPES.SlashCommandHandler).to(PingSlashCommand)
myContainer.bind(TYPES.SlashCommandHandler).to(ScreenshotSlashCommand)
myContainer.bind(TYPES.SlashCommandHandler).to(TrophySlashCommand)
myContainer.bind(TYPES.SlashCommandHandler).to(MarketplaceSlashCommand)

// Subcommands
myContainer.bind(CreateScreenshotSubcommand).toSelf()
myContainer.bind(ListScreenshotSubcommand).toSelf()
myContainer.bind(DeleteScreenshotSubcommand).toSelf()
myContainer.bind(CreateTrophyProfileSubcommand).toSelf()
myContainer.bind(CheckTrophyProfileSubcommand).toSelf()
myContainer.bind(RankSubcommand).toSelf()
myContainer.bind(SellSubcommand).toSelf()
myContainer.bind(ListAdsSubcommand).toSelf()
myContainer.bind(DeleteAdSubcommand).toSelf()

// Writes
myContainer.bind<CommandHandlerManager>(CommandHandlerManager).toSelf()

// Events
// myContainer.bind(TYPES.EventHandler).to(OnCartsItemsUpdatedHandler)
myContainer.bind<EventDispatcher>(EventDispatcher).toSelf()

// Factories

// Security

// Services
myContainer.bind(AxiosHttpClient).toSelf()
myContainer.bind(RetryAxiosHttpClient).toSelf()
myContainer.bind<HttpClient>(TYPES.HttpClient).to(RetryAxiosHttpClient)

// Bot
myContainer.bind<GuildClient>(TYPES.GuildClient).toConstantValue(
    new DiscordGuildClient(
        process.env.DISCORD_TOKEN ?? '',
    )
)
myContainer.bind(BotExecutor).toSelf()
if (process.env.DISCORD_TOKEN && process.env.DISCORD_CLIENT_ID) {
  myContainer.bind(TYPES.Bot).toConstantValue(new DiscordBot(
      process.env.DISCORD_TOKEN,
      process.env.DISCORD_CLIENT_ID,
      myContainer.get(TYPES.Logger),
      myContainer.get(BotExecutor)
  ))
}

// Console Command
myContainer.bind(WeekScreenshotWinner).toSelf()

export { myContainer }
