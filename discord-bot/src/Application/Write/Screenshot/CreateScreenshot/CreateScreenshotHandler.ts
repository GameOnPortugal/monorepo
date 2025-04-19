import { inject, injectable } from "inversify";
import type CommandHandler from "../../../../Domain/Command/CommandHandler";
import { CreateScreenshot } from "./CreateScreenshot";
import { Screenshot } from "../../../../Domain/Screenshot/Screenshot";
import type {ScreenshotRepository} from "../../../../Domain/Screenshot/ScreenshotRepository";
import { TYPES } from "../../../../Infrastructure/DependencyInjection/types";
import type Logger from "../../../Logger/Logger";
import type {HttpClient} from "../../../../Domain/Http/HttpClient.ts";
import crypto from 'crypto';
import { ScreenshotAlreadyExist } from "./ScreenshotAlreadyExist";

@injectable()
export class CreateScreenshotHandler implements CommandHandler<CreateScreenshot> {
  constructor(
    @inject(TYPES.ScreenshotRepository) private readonly screenshotRepository: ScreenshotRepository,
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.HttpClient) private readonly httpClient: HttpClient
  ) {}

  async handle(command: CreateScreenshot): Promise<Screenshot> {
    const md5 = await this.generateMd5FromImageUrl(command.image);

    if (await this.screenshotRepository.findByMd5(md5) !== null) {
      throw new ScreenshotAlreadyExist(`Screenshot with MD5 hash ${md5} already exists`);
    }

    // Create a new Screenshot entity
    const screenshot = new Screenshot(
        command.id,
        command.name,
        command.authorId,
        command.channelId,
        command.messageId,
        command.platform,
        command.image,
        md5,
        new Date(),
        new Date()
    );

    // Save the screenshot using the repository
    await this.screenshotRepository.save(screenshot);

    this.logger.info('Screenshot created successfully', {
      id: screenshot.id.toString(),
      name: command.name,
      authorId: command.authorId
    });

    return screenshot;
  }

  private async generateMd5FromImageUrl(imageUrl: string): Promise<string> {
    const imageData = await this.httpClient.get(imageUrl);

    return crypto.createHash('md5').update(Buffer.from(imageData)).digest('hex');
  }
}