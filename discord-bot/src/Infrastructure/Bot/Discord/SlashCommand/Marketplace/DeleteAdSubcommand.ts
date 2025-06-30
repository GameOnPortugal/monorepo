import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { DeleteAd } from '../../../../../Application/Write/Marketplace/DeleteAd/DeleteAd';
import { ListUserAds } from '../../../../../Application/Query/Marketplace/ListUserAds/ListUserAds';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { UnauthorizedAdDeletion } from '../../../../../Domain/Marketplace/UnauthorizedAdDeletion';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { InvalidId } from '../../../../../Domain/InvalidId';
import type { Ad } from '../../../../../Domain/Marketplace/Ad';

@injectable()
export class DeleteAdSubcommand {
  constructor(
    @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
  ) {}

  public async handle(context: SlashCommandContext): Promise<void> {
    const interaction = context.interaction
    const identifier = interaction.options.getString('id', true)
    const userId = interaction.user.id

    let adId: AdId
    try {
      if (/^\d+$/.test(identifier)) {
        const position = parseInt(identifier, 10) - 1
        const ads: Ad[] = await this.commandHandlerManager.handle(new ListUserAds(userId))
        if (position < 0 || position >= ads.length) {
          await interaction.reply({ content: 'Invalid ad position', ephemeral: true })
          return
        }
        adId = ads[position].id
      } else {
        adId = AdId.fromString(identifier)
      }
    } catch (error) {
      if (error instanceof InvalidId) {
        await interaction.reply({ content: 'Invalid Ad ID', ephemeral: true })
        return
      }
      throw error
    }

    try {
      await this.commandHandlerManager.handle(new DeleteAd(adId, userId))
      await interaction.reply({ content: 'Ad deleted successfully', ephemeral: true })
    } catch (error) {
      if (error instanceof UnauthorizedAdDeletion) {
        await interaction.reply({
          content: 'You are not authorized to delete this ad',
          ephemeral: true
        })
      } else if (error instanceof RecordNotFound) {
        await interaction.reply({
          content: 'Ad not found',
          ephemeral: true
        })
      } else {
        await interaction.reply({ content: `Error deleting ad: ${error.message}`, ephemeral: true })
      }
    }
  }
}
