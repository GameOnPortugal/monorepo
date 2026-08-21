import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { SetPrivacyOptOut } from '../../../../../Application/Write/Privacy/SetPrivacyOptOut/SetPrivacyOptOut';
import { safeReply } from '../../../../../Domain/Bot/safeReply';

@injectable()
export class OptInSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'privacy opt-in';
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const discordId = context.interaction.user.id;

        try {
            await this.commandHandlerManager.handle(new SetPrivacyOptOut(discordId, false));

            await context.interaction.reply({
                content:
                    '✅ Voltaste a aparecer publicamente no portal — os teus anúncios, ' +
                    'screenshots e perfil de troféus voltam a ser visíveis em ' +
                    'game-on-portugal.pt.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            this.logger.error('Error setting privacy opt-in', {
                error: error instanceof Error ? error.message : 'Unknown error',
                discordId,
            });

            await safeReply(context.interaction, {
                content: 'Ocorreu um erro ao processar o teu pedido. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
