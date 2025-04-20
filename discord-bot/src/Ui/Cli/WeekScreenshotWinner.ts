import { inject, injectable } from 'inversify'
import CommandHandlerManager from '../../Infrastructure/CommandHandler/CommandHandlerManager'
import { GetScreenshotWinner } from '../../Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinner'
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand'
import { TYPES } from '../../Infrastructure/DependencyInjection/types'
import type { GuildClient } from '../../Domain/Community/GuildClient'
import { CommunityChannels } from '../../Domain/Community/CommunityChannels'
import type Logger from '../../Application/Logger/Logger'

@injectable()
export default class WeekScreenshotWinner implements ConsoleCommand {
  public static commandName = 'week-screenshot-winner'

  constructor (
    @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager,
    @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  configureArgs (inputArgs: any): void {
  }

  public async run (inputArgs: any): Promise<number> {
    const date = inputArgs[0] === undefined ? new Date() : new Date(inputArgs[0])
    const dryRun = inputArgs[1] === undefined ? false : inputArgs[1] === 'true'

    this.logger.info('Running week screenshot winner command', { date, dryRun })
    if (dryRun) {
      this.logger.warn('Dry run enabled')
    }

    const winner = await this.commandHandlerManager.handle(
      new GetScreenshotWinner(date)
    )

    if (winner === null) {
      this.logger.info('No winner found for the specified week')
      return 0
    }

    const winnerInfo = {
      authorId: winner.screenshot.authorId,
      reactionCount: winner.reactionCount,
      messageUrl: winner.messageUrl
    }

    if (dryRun) {
      this.logger.info('Dry run - Winner found:', winnerInfo)
      return 0
    }

    // Send message to screenshots channel
    const message = `🏆 Screenshot of the Week Winner!\n\nCongratulations <@${winner.screenshot.authorId}>!\nYour screenshot received ${winner.reactionCount} reactions!\nCheck it out here: ${winner.messageUrl}`
    
    try {
      await this.guildClient.sendMessage(CommunityChannels.SCREENSHOTS, message)
      await this.guildClient.sendMessage(CommunityChannels.SCREENSHOTS, `!give-xp <@${winner.screenshot.authorId}> 1000`)
      this.logger.info('Winner announcement sent successfully', winnerInfo)
    } catch (error: any) {
      this.logger.error('Failed to send winner announcement', { error: error.message })
      return 1
    }

    return 0
  }
}