import { inject, injectable } from 'inversify'
import type CommandHandler from '../../../../Domain/Command/CommandHandler'
import { CreateAd } from './CreateAd'
import { Ad } from '../../../../Domain/Marketplace/Ad'
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository'
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types'
import type Logger from '../../../Logger/Logger'

@injectable()
export class CreateAdHandler implements CommandHandler<CreateAd> {
  constructor(
    @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  async handle(command: CreateAd): Promise<void> {
    // Create a new Ad entity
    const ad = new Ad(
      command.id,
      command.name,
      command.authorId,
      command.channelId,
      command.messageId,
      command.state,
      command.price,
      command.zone,
      command.dispatch,
      command.warranty,
      command.description,
      command.adType,
      new Date(),
      new Date()
    )

    // Save the ad using the repository
    await this.adRepository.save(ad)

    this.logger.info('Ad created successfully', {
      id: ad.id.toString(),
      name: command.name,
      authorId: command.authorId
    })
  }
}
