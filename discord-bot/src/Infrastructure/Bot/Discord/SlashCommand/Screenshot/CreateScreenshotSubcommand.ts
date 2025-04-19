import {inject, injectable} from "inversify";
import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager.ts";
import type Logger from "../../../../../Application/Logger/Logger.ts";
import {TYPES} from "../../../../DependencyInjection/types.ts";
import {MessageFlags} from "discord.js";
import {ScreenshotId} from "../../../../../Domain/Screenshot/ScreenshotId.ts";
import {CreateScreenshot} from "../../../../../Application/Write/Screenshot/CreateScreenshot/CreateScreenshot.ts";
import {
    ScreenshotAlreadyExist
} from "../../../../../Application/Write/Screenshot/CreateScreenshot/ScreenshotAlreadyExist.ts";
import {DiscordEmoji} from "../../../../Community/Discord/DiscordEmoji.ts";

@injectable()
export class CreateScreenshotSubcommand {
    constructor(
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.Logger) private readonly logger: Logger
    ) {
    }

    public async handle(interaction: any): Promise<void> {
        const image = interaction.options.getAttachment('image');
        const name = interaction.options.getString('name');
        const platform = interaction.options.getString('platform');

        // Validate required data
        if (!image || !name || !platform) {
            await interaction.reply('Error: Missing required information for the screenshot.', {flags: MessageFlags.Ephemeral});
            return;
        }

        // Validate image
        if (!image.contentType?.startsWith('image/')) {
            await interaction.reply('Error: The attachment must be an image.', {flags: MessageFlags.Ephemeral});
            return;
        }

        // Create a new screenshot
        const screenshotId = ScreenshotId.generate();
        try {
            await this.commandHandlerManager.handle(new CreateScreenshot(
                screenshotId,
                name,
                interaction.user.id,
                interaction.channelId,
                interaction.id,
                platform,
                image.url
            ));

            // Reply with the formatted message and the image
            const message = await interaction.reply({
                content: `📸 **Screenshot Submitted!**\n\n` +
                    `ID: #${screenshotId.toString()}\n` +
                    `Author: ${interaction.user.username}\n` +
                    `Name: ${name}\n` +
                    `Platform: ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
                files: [image.url],
                fetchReply: true // This ensures we get the message object back
            });

            // Add the trophy reaction to the message
            try {
                await message.react(DiscordEmoji.TROPHY_PLAT);
            } catch (reactionError) {
                this.logger.error('Failed to add trophy reaction', {error: reactionError});
                // Continue execution even if reaction fails
            }

            this.logger.info('Screenshot submitted successfully', {
                id: screenshotId.toString(),
                name: name,
                userId: interaction.user.id,
                platform: platform
            });
        } catch (error) {
            this.logger.error('Error submitting screenshot', {
                name: name,
                userId: interaction.user.id,
                platform: platform,
                error: error
            });

            // Check for specific error types
            if (error instanceof ScreenshotAlreadyExist) {
                await interaction.reply({
                    content: '⚠️ Error: This screenshot has already been submitted.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Generic error message for other errors
            await interaction.reply({
                content: 'There was an error submitting your screenshot. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}