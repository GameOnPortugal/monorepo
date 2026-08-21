import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { SetPrivacyOptOut } from '../../../../../Application/Write/Privacy/SetPrivacyOptOut/SetPrivacyOptOut';
import { safeReply } from '../../../../../Domain/Bot/safeReply';

@injectable()
export class OptOutSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'privacy opt-out';
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const discordId = context.interaction.user.id;

        try {
            await this.commandHandlerManager.handle(new SetPrivacyOptOut(discordId, true));

            await context.interaction.reply({
                content:
                    '✅ Deixaste de aparecer publicamente no portal — os teus anúncios, ' +
                    'screenshots e perfil de troféus deixam de ser visíveis em ' +
                    'game-on-portugal.pt. Continuas a poder usar o bot normalmente no ' +
                    'servidor. Podes voltar a aparecer a qualquer momento com `/privacy opt-in`.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            this.logger.error('Error setting privacy opt-out', {
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
