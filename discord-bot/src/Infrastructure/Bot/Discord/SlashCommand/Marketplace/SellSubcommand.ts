import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { randomUUID } from 'crypto';
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
        const interaction = context.interaction;
        const name = interaction.options.getString('name', true);
        const price = interaction.options.getString('price', true);
        const state = interaction.options.getString('state', true);
        const zone = interaction.options.getString('zone', true);
        const dispatch = interaction.options.getString('dispatch', true);
        const warranty = interaction.options.getString('warranty') ?? '';
        const description = interaction.options.getString('description') ?? '';

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
            `Listed by: <@${interaction.user.id}>`,
        ]
            .filter(Boolean)
            .join('\n');

        // Post-then-persist: acknowledge, post the listing, and only then write
        // the ad — with the real message ID already known. There is exactly one
        // database write. `editReply()` always resolves with the Message that was
        // actually sent, unlike the deprecated `reply({ fetchReply: true })` and
        // unlike `withResponse: true` (which resolves an
        // InteractionCallbackResponse, not a Message — its `.id` is the
        // interaction callback's id, not the posted message's).
        await interaction.deferReply();

        let message;
        try {
            message = await interaction.editReply({ content: replyContent });
        } catch (error) {
            const correlationId = randomUUID();
            this.logger.error('Failed to post sale listing message', {
                error,
                correlationId,
                authorId: interaction.user.id,
            });
            await interaction.editReply({
                content: `There was an error creating your sale listing. Please try again. (ref: ${correlationId})`,
            });
            return;
        }

        try {
            const command = new CreateAd(
                AdId.generate(),
                name,
                interaction.user.id,
                interaction.channelId,
                message.id,
                state,
                price,
                zone,
                dispatch,
                warranty,
                description,
                'sale',
            );

            await this.commandHandlerManager.handle(command);
        } catch (error) {
            const correlationId = randomUUID();
            this.logger.error('Failed to persist sale listing after posting', {
                error,
                correlationId,
                messageId: message.id,
                authorId: interaction.user.id,
            });
            await interaction.followUp({
                content: `Your listing was posted, but something went wrong saving it — it may not show up in /marketplace list or be deletable. Please contact a moderator. (ref: ${correlationId})`,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
