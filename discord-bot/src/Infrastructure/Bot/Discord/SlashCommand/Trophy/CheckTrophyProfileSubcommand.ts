import {inject, injectable} from "inversify";
import type {SlashCommandContext} from "../../../../../Domain/Bot/SlashCommandContext";
import {EmbedBuilder, MessageFlags} from "discord.js";
import {TYPES} from "../../../../DependencyInjection/types";
import type Logger from "../../../../../Application/Logger/Logger";
import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager";
import {GetProfile} from "../../../../../Application/Query/Trophy/GetProfile/GetProfile";
import {ProfileNotFound} from "../../../../../Application/Query/Trophy/GetProfile/ProfileNotFound";

@injectable()
export class CheckTrophyProfileSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;
        
        try {
            const command = new GetProfile(targetUser.id);
            const profile = await this.commandHandlerManager.handle(command);

            const embed = new EmbedBuilder()
                .setColor(profile.isBanned ? 0xFF0000 : profile.hasLeft ? 0xFFA500 : 0x00FF00)
                .setTitle(`🎮 PSN Profile: ${profile.psnProfile}`)
                .setDescription(`Profile for ${targetUser}`)
                .addFields(
                    { 
                        name: '📊 Status',
                        value: [
                            `${profile.isBanned ? '🚫' : '✅'} Banned: ${profile.isBanned ? 'Yes' : 'No'}`,
                            `${profile.hasLeft ? '👋' : '🏃'} Left Server: ${profile.hasLeft ? 'Yes' : 'No'}`,
                            `${profile.isExcluded ? '❌' : '✨'} Excluded: ${profile.isExcluded ? 'Yes' : 'No'}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '📅 Dates',
                        value: [
                            `🆕 Registered: ${profile.createdAt.toLocaleDateString()}`,
                            `🔄 Last Updated: ${profile.updatedAt.toLocaleDateString()}`
                        ].join('\n'),
                        inline: true
                    }
                )
                .setFooter({ text: 'PSN Profile Status' })
                .setTimestamp();

            await context.interaction.reply({
                embeds: [embed]
            });

        } catch (error) {
            if (error instanceof ProfileNotFound) {
                await context.interaction.reply({
                    content: targetUser.id === context.interaction.user.id
                        ? '❌ You have not registered your PSN profile yet. Use `/trophy create` to register.'
                        : '❌ This user has not registered their PSN profile.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            this.logger.error('Error getting trophy profile', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: targetUser.id
            });

            await context.interaction.reply({
                content: '⚠️ An error occurred while retrieving the PSN profile.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
