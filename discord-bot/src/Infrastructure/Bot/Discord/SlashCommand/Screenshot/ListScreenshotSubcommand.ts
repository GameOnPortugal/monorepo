import {inject, injectable} from "inversify";
import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager.ts";
import type Logger from "../../../../../Application/Logger/Logger.ts";
import {TYPES} from "../../../../DependencyInjection/types.ts";
import {GetScreenshots} from "../../../../../Application/Query/Screenshot/GetScreenshots/GetScreenshots.ts";
import {EmbedBuilder, MessageFlags} from "discord.js";

@injectable()
export class ListScreenshotSubcommand {
    constructor(
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.Logger) private readonly logger: Logger
    ) {
    }

    public async handle(interaction: any): Promise<void> {
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

                await interaction.reply({
                    content: message,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Create an embed to display the screenshots
            const title = isOwnScreenshots ? '🔍 Your Screenshots' : `🔍 ${targetUser.username}'s Screenshots`;
            const description = isOwnScreenshots
                ? `You have submitted ${screenshots.length} screenshot(s).`
                : `${targetUser.username} has submitted ${screenshots.length} screenshot(s).`;

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor('#0099ff')
                .setDescription(description)
                .setTimestamp();

            // Add fields for each screenshot (up to 10)
            const displayLimit = Math.min(screenshots.length, 10);
            for (let i = 0; i < displayLimit; i++) {
                const screenshot = screenshots[i];
                const platform = screenshot.platform ?
                    (screenshot.platform.charAt(0).toUpperCase() + screenshot.platform.slice(1)) :
                    'Unknown';

                embed.addFields({
                    name: `#${i + 1} - ${screenshot.name || 'Unnamed'}`,
                    value: `ID: ${screenshot.id.toString()}\nPlatform: ${platform}\nSubmitted: ${screenshot.createdAt.toLocaleDateString()}`
                });
            }

            // Add a note if there are more screenshots than shown
            if (screenshots.length > displayLimit) {
                embed.setFooter({text: `Showing ${displayLimit} of ${screenshots.length} screenshots.`});
            }

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

            this.logger.info('Screenshot list requested', {
                userId: userId,
                requestedBy: interaction.user.id,
                count: screenshots.length
            });
        } catch (error) {
            this.logger.error('Error listing screenshots', {
                userId: interaction.user.id,
                error: error
            });

            await interaction.reply({
                content: 'There was an error retrieving the screenshots. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}