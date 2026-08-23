import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import { inject, injectable } from 'inversify';
import type Logger from '../../../../../Application/Logger/Logger.ts';
import { TYPES } from '../../../../DependencyInjection/types.ts';
import { ScreenshotId } from '../../../../../Domain/Screenshot/ScreenshotId.ts';
import { DeleteScreenshot } from '../../../../../Application/Write/Screenshot/DeleteScreenshot/DeleteScreenshot.ts';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { InvalidId } from '../../../../../Domain/InvalidId.ts';
import RecordNotFound from '../../../../../Domain/RecordNotFound.ts';
import { NotAuthorized } from '../../../../../Application/Write/Screenshot/DeleteScreenshot/NotAuthorized.ts';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages.ts';

@injectable()
export class DeleteScreenshotSubcommand {
    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    public async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        const screenshotIdString = interaction.options.getString('id', true);
        const cleanId = screenshotIdString.startsWith('#')
            ? screenshotIdString.substring(1)
            : screenshotIdString;
        const m = messagesFor(interaction).screenshot;

        try {
            const screenshotId = ScreenshotId.fromString(cleanId);
            await this.commandHandlerManager.handle(
                new DeleteScreenshot(screenshotId, interaction.user.id),
            );

            await interaction.reply({
                content: m.deleted(cleanId),
                flags: MessageFlags.Ephemeral,
            });

            this.logger.info('Screenshot deleted successfully', {
                id: cleanId,
                userId: interaction.user.id,
            });
        } catch (error) {
            this.logger.error('Error deleting screenshot', {
                id: cleanId,
                userId: interaction.user.id,
                error: error,
            });

            if (error instanceof InvalidId) {
                await safeReply(interaction, {
                    content: m.invalidId,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (error instanceof RecordNotFound) {
                await safeReply(interaction, {
                    content: m.notFound(cleanId),
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (error instanceof NotAuthorized) {
                await safeReply(interaction, {
                    content: m.notAuthorized,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await safeReply(interaction, {
                content: m.deleteError,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
