import {inject, injectable} from 'inversify';
import {TYPES} from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';
import type {ScreenshotRepository} from '../../../../Domain/Screenshot/ScreenshotRepository';
import {GetScreenshotWinner} from './GetScreenshotWinner';
import {Screenshot} from '../../../../Domain/Screenshot/Screenshot';
import type {GuildClient} from "../../../../Domain/Community/GuildClient.ts";
import {CustomEmoji} from "../../../../Domain/Community/CustomEmoji.ts";
import {CommunityChannels} from "../../../../Domain/Community/CommunityChannels.ts";

interface ScreenshotWinner {
  screenshot: Screenshot;
  reactionCount: number;
  messageUrl: string;
}

@injectable()
export class GetScreenshotWinnerHandler {
  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.ScreenshotRepository) private readonly screenshotRepository: ScreenshotRepository,
    @inject(TYPES.GuildClient) private readonly guildClient: GuildClient
  ) {}

  public async handle(command: GetScreenshotWinner): Promise<ScreenshotWinner|null> {
    const screenshots = await this.screenshotRepository.findByWeek(command.week);
    
    if (screenshots.length === 0) {
      this.logger.info('No screenshots found for this week');
      return null;
    }

    this.logger.info('Found screenshots for this week', { count: screenshots.length });

    let winner: ScreenshotWinner|null = null;
    for (const screenshot of screenshots) {
      try {
        if (screenshot.messageId === null) {
          this.logger.error('Message ID is null for screenshot', { screenshotId: screenshot.id });
          continue;
        }

        const reactionCount = await this.guildClient.getTotalReactionsByEmoji(
            CommunityChannels.SCREENSHOTS,
            screenshot.messageId,
            CustomEmoji.TROPHY_PLAT
        );

        if (!winner || reactionCount > winner.reactionCount) {
          winner = {
            screenshot,
            reactionCount,
            messageUrl: await this.guildClient.getMessageUrl(CommunityChannels.SCREENSHOTS, screenshot.messageId)
          };
        }
      } catch (error: any) {
        this.logger.error('Error processing screenshot', { 
          screenshotId: screenshot.id,
          error: error.message 
        });
      }
    }

    if (!winner) {
      this.logger.info('No winner found');
      return null;
    }

    this.logger.info('Found winner', { 
      screenshotId: winner.screenshot.id,
      authorId: winner.screenshot.authorId,
      reactionCount: winner.reactionCount
    });

    return winner;
  }
}
