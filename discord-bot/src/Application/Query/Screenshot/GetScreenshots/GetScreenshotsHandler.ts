import { inject, injectable } from "inversify";
import type CommandHandler from "../../../../Domain/Command/CommandHandler";
import { GetScreenshots } from "./GetScreenshots";
import type { ScreenshotRepository } from "../../../../Domain/Screenshot/ScreenshotRepository";
import { TYPES } from "../../../../Infrastructure/DependencyInjection/types";
import type { Screenshot } from "../../../../Domain/Screenshot/Screenshot";

@injectable()
export class GetScreenshotsHandler implements CommandHandler<GetScreenshots> {
  constructor(
    @inject(TYPES.ScreenshotRepository) private readonly screenshotRepository: ScreenshotRepository,
  ) {}

  async handle(command: GetScreenshots): Promise<Screenshot[]> {
    return await this.screenshotRepository.findBy(command.userId);
  }
}