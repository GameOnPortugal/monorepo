import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { randomUUID } from 'crypto';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { BumpAd } from '../../../../../Application/Write/Marketplace/BumpAd/BumpAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { UnauthorizedAdAction } from '../../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../../Domain/Marketplace/AdNotActive';
import { AdBumpRateLimited } from '../../../../../Domain/Marketplace/AdBumpRateLimited';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { InvalidId } from '../../../../../Domain/InvalidId';
import { DiscordChannels } from '../../../../Community/Discord/DiscordChannels';
import { formatHoursRemaining } from './formatHoursRemaining';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages';

/**
 * `/marketplace bump` (M5.6) — the slash-command twin of the `🔄 Renovar`
 * button. Both go through `BumpAdHandler`; this file only builds the
 * `BumpAd` command from a slash interaction instead of a button click.
 */
@injectable()
export class BumpAdSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const identifier = interaction.options.getString('id', true);
        const userId = interaction.user.id;
        const m = messagesFor(interaction).marketplace;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let adId: AdId;
        try {
            adId = AdId.fromString(identifier.trim());
        } catch (error) {
            if (error instanceof InvalidId) {
                await interaction.editReply({ content: m.invalidAdId });
                return;
            }
            throw error;
        }

        try {
            await this.commandHandlerManager.handle(
                new BumpAd(adId, userId, DiscordChannels.MARKETPLACE),
            );
            await interaction.editReply({ content: m.adBumped });
        } catch (error) {
            if (error instanceof UnauthorizedAdAction) {
                await interaction.editReply({
                    content: m.noPermissionTo(m.actionBump),
                });
            } else if (error instanceof AdNotActive) {
                await interaction.editReply({ content: m.adNotActive });
            } else if (error instanceof AdBumpRateLimited) {
                await interaction.editReply({
                    content: m.bumpRateLimited(formatHoursRemaining(error.nextEligibleAt)),
                });
            } else if (error instanceof RecordNotFound) {
                await interaction.editReply({ content: m.adNotFound });
            } else {
                const correlationId = randomUUID();
                this.logger.error('Error bumping ad', {
                    error,
                    correlationId,
                    adId: adId.toString(),
                    userId,
                });
                await interaction.editReply({ content: m.bumpError(correlationId) });
            }
        }
    }
}
