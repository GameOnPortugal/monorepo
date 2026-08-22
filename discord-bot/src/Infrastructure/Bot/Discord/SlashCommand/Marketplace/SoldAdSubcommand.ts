import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { randomUUID } from 'crypto';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { MarkAdSold } from '../../../../../Application/Write/Marketplace/MarkAdSold/MarkAdSold';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { UnauthorizedAdAction } from '../../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../../Domain/Marketplace/AdNotActive';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { InvalidId } from '../../../../../Domain/InvalidId';
import { isGuildAdmin } from '../../../../../Domain/Bot/AdminCheck';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages';

/**
 * `/marketplace sold` (M5.6) — the slash-command twin of the `✅ Marcar
 * vendido` button. Both go through `MarkAdSoldHandler`; this file only
 * builds the `MarkAdSold` command from a slash interaction instead of a
 * button click.
 */
@injectable()
export class SoldAdSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const identifier = interaction.options.getString('id', true);
        const userId = interaction.user.id;
        const isAdmin = isGuildAdmin(interaction);
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
            await this.commandHandlerManager.handle(new MarkAdSold(adId, userId, isAdmin));
            await interaction.editReply({ content: m.adSold });
        } catch (error) {
            if (error instanceof UnauthorizedAdAction) {
                await interaction.editReply({
                    content: m.noPermissionTo(m.actionMarkSold),
                });
            } else if (error instanceof AdNotActive) {
                await interaction.editReply({ content: m.adNotActive });
            } else if (error instanceof RecordNotFound) {
                await interaction.editReply({ content: m.adNotFound });
            } else {
                const correlationId = randomUUID();
                this.logger.error('Error marking ad sold', {
                    error,
                    correlationId,
                    adId: adId.toString(),
                    userId,
                });
                await interaction.editReply({ content: m.soldError(correlationId) });
            }
        }
    }
}
