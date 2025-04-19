import { inject, injectable } from 'inversify'
import type CommandHandler from '../../../../Domain/Command/CommandHandler'
import { DeleteAd } from './DeleteAd'
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository'
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types'
import type Logger from '../../../Logger/Logger'
import { UnauthorizedAdDeletion } from '../../../../Domain/Marketplace/UnauthorizedAdDeletion'

@injectable()
export class DeleteAdHandler implements CommandHandler<DeleteAd> {
  constructor(
    @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  async handle(command: DeleteAd): Promise<void> {
    const ad = await this.adRepository.get(command.id)

    // Verify that the user owns the ad
    if (ad.authorId !== command.userId) {
      throw new UnauthorizedAdDeletion(`User ${command.userId} is not authorized to delete ad ${command.id.toString()}`)
    }

    // Delete the ad
    await this.adRepository.delete(command.id)

    this.logger.info('Ad deleted successfully', {
      id: command.id.toString(),
      userId: command.userId
    })
  }
}
