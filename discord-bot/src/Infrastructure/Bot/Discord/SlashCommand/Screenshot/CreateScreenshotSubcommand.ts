import { inject, injectable } from 'inversify';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import type Logger from '../../../../../Application/Logger/Logger.ts';
import { TYPES } from '../../../../DependencyInjection/types.ts';
import { escapeMarkdown, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { randomUUID } from 'crypto';
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

    public async handle(interaction: ChatInputCommandInteraction): Promise<void> {
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

        // Defer first: the reply is filled in via editReply() below, which
        // (unlike the deprecated `fetchReply: true` option) returns a real
        // Message directly, and lets the write path take longer than the 3s
        // interaction-ack window without failing.
        await interaction.deferReply();

        // Post-then-persist (M6.2, same fix as M0.1's marketplace listing):
        // post first so the real, resolvable message id is known *before*
        // it is written anywhere, instead of persisting `interaction.id` (a
        // value that never resolves to a message — cross-cutting rule 4,
        // and the root cause of every dead `message_id` in the screenshots
        // table). One write, with the real id already in hand.
        let message;
        try {
            message = await interaction.editReply({
                content:
                    `📸 **Screenshot Submitted!**\n\n` +
                    `ID: #${screenshotId.toString()}\n` +
                    `Author: ${interaction.user.username}\n` +
                    `Name: ${escapeMarkdown(name)}\n` +
                    `Platform: ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
                files: [image.url],
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            const correlationId = randomUUID();
            this.logger.error('Failed to post screenshot message', {
                error,
                correlationId,
                userId: interaction.user.id,
            });
            await safeReply(interaction, {
                content: `There was an error submitting your screenshot. Please try again. (ref: ${correlationId})`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            await this.commandHandlerManager.handle(
                new CreateScreenshot(
                    screenshotId,
                    name,
                    interaction.user.id,
                    interaction.channelId,
                    message.id,
                    platform,
                    image.url,
                    // M4.9 added this field but no call site ever populated
                    // it — wired now: Discord reports the attachment's real
                    // byte size on the interaction, letting the handler
                    // reject an oversized upload before any network call.
                    image.size,
                ),
            );

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

            // The message is already posted publicly at this point (unlike
            // the pre-M6.2 flow, which persisted before posting) — tell the
            // author their listing may be broken rather than silently
            // leaving an orphaned public message with no matching row.
            const correlationId = randomUUID();
            this.logger.error('Failed to persist screenshot after posting', {
                error,
                correlationId,
                messageId: message.id,
                userId: interaction.user.id,
            });
            await safeReply(interaction, {
                content: `Your screenshot was posted, but something went wrong saving it — it may not count for the contest. Please contact a moderator. (ref: ${correlationId})`,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
