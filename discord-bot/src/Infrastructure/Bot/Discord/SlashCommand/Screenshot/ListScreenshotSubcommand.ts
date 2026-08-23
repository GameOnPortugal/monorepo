import { inject, injectable } from 'inversify';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import type Logger from '../../../../../Application/Logger/Logger.ts';
import { TYPES } from '../../../../DependencyInjection/types.ts';
import { GetScreenshots } from '../../../../../Application/Query/Screenshot/GetScreenshots/GetScreenshots.ts';
import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';
import { capFields } from '../../../../../Domain/Bot/embedLimits.ts';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages.ts';
import type { Screenshot } from '../../../../../Domain/Screenshot/Screenshot.ts';

/** `/screenshot list`'s own display limit — smaller than Discord's 25-field cap. */
const SCREENSHOT_LIST_DISPLAY_LIMIT = 10;

@injectable()
export class ListScreenshotSubcommand {
    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    public async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        // Deferred first: GetScreenshots can load a user's full history, which
        // can take longer than the 3s interaction-ack window. The reply here
        // is ephemeral either way, so the flag is safe to fix at defer time.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Ephemeral for the whole command, so the whole embed — not just the
        // error paths — is rendered in the asking member's Discord language.
        const catalogue = messagesFor(interaction);
        const m = catalogue.screenshot;

        try {
            // Get the target user (if specified) or default to the command user
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userId = targetUser.id;
            const isOwnScreenshots = userId === interaction.user.id;

            // Create and execute the GetScreenshots command
            const command = new GetScreenshots(userId);
            const screenshots = await this.commandHandlerManager.handle(command);

            if (screenshots.length === 0) {
                const message = isOwnScreenshots
                    ? m.noneOfYourOwn
                    : m.noneForUser(targetUser.username);

                await interaction.editReply({ content: message });
                return;
            }

            // Create an embed to display the screenshots
            const title = isOwnScreenshots
                ? m.yourScreenshotsTitle
                : m.userScreenshotsTitle(targetUser.username);
            const description = isOwnScreenshots
                ? m.yourScreenshotsCount(screenshots.length)
                : m.userScreenshotsCount(targetUser.username, screenshots.length);

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor('#0099ff')
                .setDescription(description)
                .setTimestamp();

            const { fields, omittedCount } = capFields(
                screenshots,
                (screenshot: Screenshot, index: number) => {
                    const platform = screenshot.platform
                        ? screenshot.platform.charAt(0).toUpperCase() + screenshot.platform.slice(1)
                        : m.unknownPlatform;

                    return {
                        name: `#${index + 1} - ${screenshot.name || m.unnamed}`,
                        value: m.entryLine(
                            screenshot.id.toString(),
                            platform,
                            screenshot.createdAt.toLocaleDateString(catalogue.intlLocale),
                        ),
                    };
                },
                title.length + description.length,
                SCREENSHOT_LIST_DISPLAY_LIMIT,
            );
            embed.addFields(fields);

            // Add a note if there are more screenshots than shown
            if (omittedCount > 0) {
                embed.setFooter({
                    text: m.listFooter(fields.length, screenshots.length),
                });
            }

            await interaction.editReply({ embeds: [embed] });

            this.logger.info('Screenshot list requested', {
                userId: userId,
                requestedBy: interaction.user.id,
                count: screenshots.length,
            });
        } catch (error) {
            this.logger.error('Error listing screenshots', {
                userId: interaction.user.id,
                error: error,
            });

            await safeReply(interaction, {
                content: m.listError,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
