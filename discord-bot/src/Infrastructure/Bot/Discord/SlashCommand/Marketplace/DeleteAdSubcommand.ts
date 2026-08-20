import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { randomUUID } from 'crypto';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
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
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const identifier = interaction.options.getString('id', true);
        const userId = interaction.user.id;

        // Deferred first: resolving a numeric position requires a ListUserAds
        // query before the delete itself, so this can already be slower than
        // the 3s interaction-ack window. Every reply below is ephemeral, so
        // fixing that at defer time changes nothing about visibility.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let adId: AdId;
        try {
            if (/^\d+$/.test(identifier)) {
                const position = parseInt(identifier, 10) - 1;
                const ads: Ad[] = await this.commandHandlerManager.handle(new ListUserAds(userId));
                // Look the ad up rather than bounds-check then index: `noUncheckedIndexedAccess`
                // types the element as possibly-undefined and cannot see the guard above.
                const ad = ads[position];
                if (!ad) {
                    await interaction.editReply({ content: 'Invalid ad position' });
                    return;
                }
                adId = ad.id;
            } else {
                adId = AdId.fromString(identifier);
            }
        } catch (error) {
            if (error instanceof InvalidId) {
                await interaction.editReply({ content: 'Invalid Ad ID' });
                return;
            }
            throw error;
        }

        try {
            await this.commandHandlerManager.handle(new DeleteAd(adId, userId));
            await interaction.editReply({ content: 'Ad deleted successfully' });
        } catch (error) {
            if (error instanceof UnauthorizedAdDeletion) {
                await interaction.editReply({
                    content: 'You are not authorized to delete this ad',
                });
            } else if (error instanceof RecordNotFound) {
                await interaction.editReply({
                    content: 'Ad not found',
                });
            } else {
                const correlationId = randomUUID();
                this.logger.error('Error deleting ad', {
                    error,
                    correlationId,
                    adId: adId.toString(),
                    userId,
                });
                await interaction.editReply({
                    content: `There was an error deleting your ad. Please try again. (ref: ${correlationId})`,
                });
            }
        }
    }
}
