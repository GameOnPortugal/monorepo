import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { randomUUID } from 'crypto';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { CreateAd } from '../../../../../Application/Write/Marketplace/CreateAd/CreateAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import type { GuildClient } from '../../../../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../../../../Domain/Community/CommunityChannels';
import { DiscordChannels, DISCORD_GUILD_ID } from '../../../../Community/Discord/DiscordChannels';

@injectable()
export class SellSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
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

        // Post-then-persist (M0.1), now routed through the GuildClient port to
        // the marketplace channel (M5.1) instead of `interaction.reply()` —
        // the command can be run from anywhere, but the listing itself always
        // lands in #anuncios. The interaction reply becomes a private
        // confirmation to the seller rather than the public listing itself,
        // so it is ephemeral from the first ack.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let messageId: string;
        try {
            messageId = await this.guildClient.sendMessage(
                CommunityChannels.MARKETPLACE,
                replyContent,
            );
        } catch (error) {
            const correlationId = randomUUID();
            this.logger.error('Failed to post sale listing to the marketplace channel', {
                error,
                correlationId,
                authorId: interaction.user.id,
            });
            await interaction.editReply({
                content: `Não foi possível publicar o teu anúncio. Tenta novamente. (ref: ${correlationId})`,
            });
            return;
        }

        try {
            const command = new CreateAd(
                AdId.generate(),
                name,
                interaction.user.id,
                DiscordChannels.MARKETPLACE,
                messageId,
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
                messageId,
                authorId: interaction.user.id,
            });
            await interaction.followUp({
                content: `O teu anúncio foi publicado, mas houve um erro ao guardá-lo — pode não aparecer em /marketplace list nem ser possível apagá-lo. Contacta um moderador. (ref: ${correlationId})`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const listingUrl = `https://discord.com/channels/${DISCORD_GUILD_ID}/${DiscordChannels.MARKETPLACE}/${messageId}`;
        await interaction.editReply({
            content: `✅ O teu anúncio foi publicado: ${listingUrl}`,
        });
    }
}
