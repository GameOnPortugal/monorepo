import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags, EmbedBuilder } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import { ListUserAds } from '../../../../../Application/Query/Marketplace/ListUserAds/ListUserAds';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import type { Ad } from '../../../../../Domain/Marketplace/Ad.ts';
import { capFields } from '../../../../../Domain/Bot/embedLimits.ts';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';

@injectable()
export class ListAdsSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    private getStateEmoji(state: string): string {
        switch (state) {
            case 'new':
                return '🆕';
            case 'like_new':
                return '✨';
            case 'used_good':
                return '👍';
            case 'used_marks':
                return '📝';
            case 'broken':
                return '🔧';
            default:
                return '❓';
        }
    }

    private getStateDisplay(state: string): string {
        switch (state) {
            case 'new':
                return 'New';
            case 'like_new':
                return 'Like new';
            case 'used_good':
                return 'Used - Good condition';
            case 'used_marks':
                return 'Used - With marks';
            case 'broken':
                return 'Broken';
            default:
                return state;
        }
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;

        // The successful reply is public (no `flags`), so the defer is public
        // too — ephemeral-ness is fixed at defer time and cannot change later.
        // The error/no-ads paths below used to be ephemeral; they now post
        // publicly like the rest of this command, which is the intentional
        // trade-off for being able to defer at all (see PR description).
        await context.interaction.deferReply();

        try {
            const ads = await this.commandHandlerManager.handle(new ListUserAds(targetUser.id));

            if (ads.length === 0) {
                await context.interaction.editReply({
                    content: `${targetUser.id === context.interaction.user.id ? "You don't" : "This user doesn't"} have any active listings.`,
                });
                return;
            }

            const title = `${targetUser.username}'s Marketplace Listings`;
            const description = `Found ${ads.length} active listing${ads.length === 1 ? '' : 's'}`;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            const { fields, omittedCount } = capFields(
                ads,
                (ad: Ad, index: number) => ({
                    name: `${index + 1}. ${ad.name}`,
                    value: [
                        `${this.getStateEmoji(ad.state)} ${this.getStateDisplay(ad.state)}`,
                        `💰 Price: ${ad.price}`,
                        `📍 Location: ${ad.zone}`,
                        `🚚 Dispatch: ${ad.dispatch}`,
                        `🆔 ID: ${ad.id.toString()}`,
                        ad.warranty ? `⚡ Warranty: ${ad.warranty}` : null,
                        ad.description ? `📝 ${ad.description}` : null,
                        `\n[View Listing](https://discord.com/channels/${context.interaction.guildId}/${ad.channelId}/${ad.messageId})`,
                    ]
                        .filter(Boolean)
                        .join('\n'),
                }),
                title.length + description.length,
            );
            embed.addFields(fields);

            if (omittedCount > 0) {
                embed.setFooter({
                    text: `Showing ${fields.length} of ${ads.length} listings — ${omittedCount} omitted. Narrow your search or ask an admin if you need to see the rest.`,
                });
            }

            await context.interaction.editReply({ embeds: [embed] });
        } catch (error) {
            this.logger.error('Error listing ads', { error });
            await safeReply(context.interaction, {
                content: 'There was an error fetching the listings. Please try again.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
