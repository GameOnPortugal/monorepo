import { inject, injectable } from "inversify";
import type { SlashCommandContext } from "../../../../../Domain/Bot/SlashCommandContext";
import { MessageFlags, EmbedBuilder } from "discord.js";
import { TYPES } from "../../../../DependencyInjection/types";
import type Logger from "../../../../../Application/Logger/Logger";
import { ListUserAds } from "../../../../../Application/Query/Marketplace/ListUserAds/ListUserAds";
import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager.ts";
import type {Ad} from "../../../../../Domain/Marketplace/Ad.ts";

@injectable()
export class ListAdsSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
    ) {}

    private getStateEmoji(state: string): string {
        switch (state) {
            case 'new': return '🆕';
            case 'like_new': return '✨';
            case 'used_good': return '👍';
            case 'used_marks': return '📝';
            case 'broken': return '🔧';
            default: return '❓';
        }
    }

    private getStateDisplay(state: string): string {
        switch (state) {
            case 'new': return 'New';
            case 'like_new': return 'Like new';
            case 'used_good': return 'Used - Good condition';
            case 'used_marks': return 'Used - With marks';
            case 'broken': return 'Broken';
            default: return state;
        }
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;
        
        try {
            const ads = await this.commandHandlerManager.handle(new ListUserAds(targetUser.id));

            if (ads.length === 0) {
                await context.interaction.reply({
                    content: `${targetUser.id === context.interaction.user.id ? "You don't" : "This user doesn't"} have any active listings.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${targetUser.username}'s Marketplace Listings`)
                .setDescription(`Found ${ads.length} active listing${ads.length === 1 ? '' : 's'}`)
                .setTimestamp();

            ads.forEach((ad: Ad, index: number) => {
                embed.addFields({
                    name: `${index + 1}. ${ad.name}`,
                    value: [
                        `${this.getStateEmoji(ad.state)} ${this.getStateDisplay(ad.state)}`,
                        `💰 Price: ${ad.price}`,
                        `📍 Location: ${ad.zone}`,
                        `🚚 Dispatch: ${ad.dispatch}`,
                        `🆔 ID: ${ad.id.toString()}`,
                        ad.warranty ? `⚡ Warranty: ${ad.warranty}` : null,
                        ad.description ? `📝 ${ad.description}` : null,
                        `\n[View Listing](https://discord.com/channels/${context.interaction.guildId}/${ad.channelId}/${ad.messageId})`
                    ].filter(Boolean).join('\n')
                });
            });

            await context.interaction.reply({ embeds: [embed] });

        } catch (error) {
            this.logger.error('Error listing ads', { error });
            await context.interaction.reply({
                content: 'There was an error fetching the listings. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
