import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager.ts";
import {inject} from "inversify";
import type Logger from "../../../../../Application/Logger/Logger.ts";
import {TYPES} from "../../../../DependencyInjection/types.ts";
import {ScreenshotId} from "../../../../../Domain/Screenshot/ScreenshotId.ts";
import {DeleteScreenshot} from "../../../../../Application/Write/Screenshot/DeleteScreenshot/DeleteScreenshot.ts";
import {MessageFlags} from "discord.js";
import {InvalidId} from "../../../../../Domain/InvalidId.ts";
import RecordNotFound from "../../../../../Domain/RecordNotFound.ts";
import {NotAuthorized} from "../../../../../Application/Write/Screenshot/DeleteScreenshot/NotAuthorized.ts";

export class DeleteScreenshotSubcommand {
    constructor(
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.Logger) private readonly logger: Logger
    ) {
    }

    public async handle(interaction: any): Promise<void> {
        const screenshotIdString = interaction.options.getString('id');
        const cleanId = screenshotIdString.startsWith('#')
            ? screenshotIdString.substring(1)
            : screenshotIdString;

        try {
            const screenshotId = ScreenshotId.fromString(cleanId);
            await this.commandHandlerManager.handle(new DeleteScreenshot(
                screenshotId,
                interaction.user.id
            ));

            await interaction.reply({
                content: `✅ Screenshot #${cleanId} has been deleted successfully.`,
                flags: MessageFlags.Ephemeral
            });

            this.logger.info('Screenshot deleted successfully', {
                id: cleanId,
                userId: interaction.user.id
            });
        } catch (error) {
            this.logger.error('Error deleting screenshot', {
                id: cleanId,
                userId: interaction.user.id,
                error: error
            });

            if (error instanceof InvalidId) {
                await interaction.reply({
                    content: `⚠️ Error: Invalid screenshot ID format.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (error instanceof RecordNotFound) {
                await interaction.reply({
                    content: `⚠️ Error: Screenshot with ID #${cleanId} was not found.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (error instanceof NotAuthorized) {
                await interaction.reply({
                    content: `⛔ Error: You are not authorized to delete this screenshot.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: 'There was an error deleting the screenshot. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}