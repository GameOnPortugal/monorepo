import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { SetPrivacyOptOut } from '../../../../../Application/Write/Privacy/SetPrivacyOptOut/SetPrivacyOptOut';
import { safeReply } from '../../../../../Domain/Bot/safeReply';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages';

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
        const m = messagesFor(context.interaction).privacy;

        try {
            await this.commandHandlerManager.handle(new SetPrivacyOptOut(discordId, true));

            await context.interaction.reply({
                content: m.optedOut,
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            this.logger.error('Error setting privacy opt-out', {
                error: error instanceof Error ? error.message : 'Unknown error',
                discordId,
            });

            await safeReply(context.interaction, {
                content: m.error,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
