import { inject, injectable } from 'inversify';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import type Logger from '../../../../../Application/Logger/Logger.ts';
import { TYPES } from '../../../../DependencyInjection/types.ts';
import { escapeMarkdown, MessageFlags } from 'discord.js';
import { ScreenshotId } from '../../../../../Domain/Screenshot/ScreenshotId.ts';
import { CreateScreenshot } from '../../../../../Application/Write/Screenshot/CreateScreenshot/CreateScreenshot.ts';
import { ScreenshotAlreadyExist } from '../../../../../Application/Write/Screenshot/CreateScreenshot/ScreenshotAlreadyExist.ts';
import { DiscordEmoji } from '../../../../Community/Discord/DiscordEmoji.ts';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';

@injectable()
export class CreateScreenshotSubcommand {
    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    public async handle(interaction: any): Promise<void> {
        const image = interaction.options.getAttachment('image');
        const name = interaction.options.getString('name');
        const platform = interaction.options.getString('platform');

        // Validate required data
        if (!image || !name || !platform) {
            await interaction.reply({
                content: 'Error: Missing required information for the screenshot.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Validate image
        if (!image.contentType?.startsWith('image/')) {
            await interaction.reply({
                content: 'Error: The attachment must be an image.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Create a new screenshot
        const screenshotId = ScreenshotId.generate();
        try {
            // Defer first: the reply is filled in via editReply() below, which
            // (unlike the deprecated `fetchReply: true` option) returns a real
            // Message directly, and lets CreateScreenshot's write path take
            // longer than the 3s interaction-ack window without failing.
            await interaction.deferReply();

            await this.commandHandlerManager.handle(
                new CreateScreenshot(
                    screenshotId,
                    name,
                    interaction.user.id,
                    interaction.channelId,
                    interaction.id,
                    platform,
                    image.url,
                ),
            );

            // Reply with the formatted message and the image. `name` is
            // user-supplied and lands directly in message content, so it is
            // escaped (markdown injection) and mentions are explicitly
            // disabled on this reply (mention injection, M0.2/A1) in
            // addition to the client-wide default set in DiscordBot.ts.
            const message = await interaction.editReply({
                content:
                    `📸 **Screenshot Submitted!**\n\n` +
                    `ID: #${screenshotId.toString()}\n` +
                    `Author: ${interaction.user.username}\n` +
                    `Name: ${escapeMarkdown(name)}\n` +
                    `Platform: ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
                files: [image.url],
                allowedMentions: { parse: [] },
            });

            // Add the trophy reaction to the message
            try {
                await message.react(DiscordEmoji.TROPHY_PLAT);
            } catch (reactionError) {
                this.logger.error('Failed to add trophy reaction', { error: reactionError });
                // Continue execution even if reaction fails
            }

            this.logger.info('Screenshot submitted successfully', {
                id: screenshotId.toString(),
                name: name,
                userId: interaction.user.id,
                platform: platform,
            });
        } catch (error) {
            this.logger.error('Error submitting screenshot', {
                name: name,
                userId: interaction.user.id,
                platform: platform,
                error: error,
            });

            // Check for specific error types
            if (error instanceof ScreenshotAlreadyExist) {
                await safeReply(interaction, {
                    content: '⚠️ Error: This screenshot has already been submitted.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Generic error message for other errors
            await safeReply(interaction, {
                content: 'There was an error submitting your screenshot. Please try again later.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
