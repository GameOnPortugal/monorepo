import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { DeleteAd } from '../../../../../Application/Write/Marketplace/DeleteAd/DeleteAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { UnauthorizedAdDeletion } from '../../../../../Domain/Marketplace/UnauthorizedAdDeletion';
import RecordNotFound from '../../../../../Domain/RecordNotFound';

@injectable()
export class DeleteAdSubcommand {
  constructor(
    @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
  ) {}

  public async handle(context: SlashCommandContext): Promise<void> {
    const interaction = context.interaction
    const adId = AdId.fromString(interaction.options.getString('id', true))
    const userId = interaction.user.id

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
        throw error
      }
    }
  }
}
