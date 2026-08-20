import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { randomUUID } from 'crypto';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { CreateAd } from '../../../../../Application/Write/Marketplace/CreateAd/CreateAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { Ad } from '../../../../../Domain/Marketplace/Ad';
import { renderAdListing } from '../../../../../Domain/Marketplace/AdListingRenderer';
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

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const name = interaction.options.getString('name', true);
        const price = interaction.options.getString('price', true);
        const state = interaction.options.getString('state', true);
        const zone = interaction.options.getString('zone', true);
        const dispatch = interaction.options.getString('dispatch', true);
        const warranty = interaction.options.getString('warranty') ?? '';
        const description = interaction.options.getString('description') ?? '';

        // Post-then-persist (M0.1), now routed through the GuildClient port to
        // the marketplace channel (M5.1) instead of `interaction.reply()` —
        // the command can be run from anywhere, but the listing itself always
        // lands in #anuncios. The interaction reply becomes a private
        // confirmation to the seller rather than the public listing itself,
        // so it is ephemeral from the first ack.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // M5.5: the listing is now a rich embed + buttons
        // (`renderAdListing`), not a plain string — built from a throwaway,
        // not-yet-persisted `Ad` holding exactly what is about to be
        // written, so `SellSubcommand` and the bump/edit paths (which render
        // from a real, persisted `Ad`) can never drift from the same
        // renderer.
        const adId = AdId.generate();
        const draft = new Ad(
            adId,
            name,
            interaction.user.id,
            DiscordChannels.MARKETPLACE,
            '',
            state,
            price,
            zone,
            dispatch,
            warranty,
            description,
            'sell',
            new Date(),
            new Date(),
        );

        let messageId: string;
        try {
            messageId = await this.guildClient.sendRichMessage(
                CommunityChannels.MARKETPLACE,
                renderAdListing(draft, { authorDisplayName: interaction.user.username }),
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
                adId,
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
                'sell',
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
