import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { CreateAd } from '../../../../../Application/Write/Marketplace/CreateAd/CreateAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';

@injectable()
export class SellSubcommand {
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
        const name = context.interaction.options.getString('name', true);
        const price = context.interaction.options.getString('price', true);
        const state = context.interaction.options.getString('state', true);
        const zone = context.interaction.options.getString('zone', true);
        const dispatch = context.interaction.options.getString('dispatch', true);
        const warranty = context.interaction.options.getString('warranty') ?? '';
        const description = context.interaction.options.getString('description') ?? '';

        try {
            const command = new CreateAd(
                AdId.generate(),
                name,
                context.interaction.user.id,
                context.interaction.channelId,
                '', // message_id will be set after the reply
                state,
                price,
                zone,
                dispatch,
                warranty,
                description,
                'sale',
            );

            const ad = await this.commandHandlerManager.handle(command);

            const replyContent = [
                '🏷️ New Sale Listing',
                `**${name}**`,
                `${this.getStateEmoji(state)} Condition: ${this.getStateDisplay(state)}`,
                `💰 Price: ${price}`,
                `📍 Location: ${zone}`,
                `🚚 Dispatch: ${dispatch}`,
                warranty ? `⚡ Warranty: ${warranty}` : '',
                description ? `📝 Description: ${description}` : '',
                '',
                `Listed by: <@${context.interaction.user.id}>`,
            ]
                .filter(Boolean)
                .join('\n');

            const reply = await context.interaction.reply({
                content: replyContent,
                fetchReply: true,
            });

            // Update the ad with the message ID
            const updateCommand = new CreateAd(
                ad.id,
                ad.name,
                ad.authorId,
                ad.channelId,
                reply.id,
                ad.state,
                ad.price,
                ad.zone,
                ad.dispatch,
                ad.warranty,
                ad.description,
                ad.adType,
            );

            await this.commandHandlerManager.handle(updateCommand);
        } catch (error) {
            this.logger.error('Error creating sale listing', { error });
            await context.interaction.reply({
                content: 'There was an error creating your sale listing. Please try again.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
