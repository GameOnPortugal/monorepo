import { inject, injectable } from "inversify";
import type CommandHandler from "../../../../Domain/Command/CommandHandler";
import { DeleteScreenshot } from "./DeleteScreenshot";
import type { ScreenshotRepository } from "../../../../Domain/Screenshot/ScreenshotRepository";
import { TYPES } from "../../../../Infrastructure/DependencyInjection/types";
import type Logger from "../../../Logger/Logger";
import { NotAuthorized } from "./NotAuthorized";

@injectable()
export class DeleteScreenshotHandler implements CommandHandler<DeleteScreenshot> {
  constructor(
    @inject(TYPES.ScreenshotRepository) private readonly screenshotRepository: ScreenshotRepository,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  async handle(command: DeleteScreenshot): Promise<void> {
    const screenshot = await this.screenshotRepository.get(command.id);

    if (screenshot.authorId !== command.userId) {
      this.logger.warn('Unauthorized delete attempt', {
        screenshotId: command.id.toString(),
        userId: command.userId,
        authorId: screenshot.authorId
      });

      throw new NotAuthorized(command.userId, command.id.toString());
    }

    await this.screenshotRepository.delete(command.id);

    this.logger.info('Screenshot deleted successfully', {
      id: command.id.toString(),
      userId: command.userId
    });
  }
}