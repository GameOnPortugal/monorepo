import { inject, injectable } from 'inversify';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import type Logger from '../../../../../Application/Logger/Logger.ts';
import { TYPES } from '../../../../DependencyInjection/types.ts';
import { GetScreenshots } from '../../../../../Application/Query/Screenshot/GetScreenshots/GetScreenshots.ts';
import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';
import { capFields } from '../../../../../Domain/Bot/embedLimits.ts';
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
                    ? `🔍 **Your Screenshots**\n\nYou haven't submitted any screenshots yet. Use \`/screenshot create\` to submit one!`
                    : `🔍 **${targetUser.username}'s Screenshots**\n\nThis user hasn't submitted any screenshots yet.`;

                await interaction.editReply({ content: message });
                return;
            }

            // Create an embed to display the screenshots
            const title = isOwnScreenshots
                ? '🔍 Your Screenshots'
                : `🔍 ${targetUser.username}'s Screenshots`;
            const description = isOwnScreenshots
                ? `You have submitted ${screenshots.length} screenshot(s).`
                : `${targetUser.username} has submitted ${screenshots.length} screenshot(s).`;

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
                        : 'Unknown';

                    return {
                        name: `#${index + 1} - ${screenshot.name || 'Unnamed'}`,
                        value: `ID: ${screenshot.id.toString()}\nPlatform: ${platform}\nSubmitted: ${screenshot.createdAt.toLocaleDateString()}`,
                    };
                },
                title.length + description.length,
                SCREENSHOT_LIST_DISPLAY_LIMIT,
            );
            embed.addFields(fields);

            // Add a note if there are more screenshots than shown
            if (omittedCount > 0) {
                embed.setFooter({
                    text: `Showing ${fields.length} of ${screenshots.length} screenshots.`,
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
                content: 'There was an error retrieving the screenshots. Please try again later.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
