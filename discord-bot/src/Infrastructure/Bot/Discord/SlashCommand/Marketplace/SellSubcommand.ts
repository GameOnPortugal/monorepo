import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { randomUUID } from 'crypto';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { CreateAd } from '../../../../../Application/Write/Marketplace/CreateAd/CreateAd';
import { CountActiveAds } from '../../../../../Application/Query/Marketplace/CountActiveAds/CountActiveAds';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { Ad } from '../../../../../Domain/Marketplace/Ad';
import { MAX_ACTIVE_ADS_PER_USER } from '../../../../../Domain/Marketplace/AdLimits';
import { renderAdListing } from '../../../../../Domain/Marketplace/AdListingRenderer';
import type { GuildClient } from '../../../../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../../../../Domain/Community/CommunityChannels';
import { DiscordChannels, DISCORD_GUILD_ID } from '../../../../Community/Discord/DiscordChannels';
import { AdImageUploader } from '../../../../Media/AdImageUploader';

@injectable()
export class SellSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(AdImageUploader) private readonly adImageUploader: AdImageUploader,
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
        const image = interaction.options.getAttachment('image');

        // Post-then-persist (M0.1), now routed through the GuildClient port to
        // the marketplace channel (M5.1) instead of `interaction.reply()` —
        // the command can be run from anywhere, but the listing itself always
        // lands in #anuncios. The interaction reply becomes a private
        // confirmation to the seller rather than the public listing itself,
        // so it is ephemeral from the first ack.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // M5.10 — refused *before* anything is posted, not inside
        // CreateAdHandler: post-then-persist (M0.1) means a limit enforced
        // only at the write would refuse to save a listing that is already
        // public, producing exactly the orphaned-message failure mode M0.1
        // was fixed to stop causing.
        const activeCount = await this.commandHandlerManager.handle(
            new CountActiveAds(interaction.user.id),
        );
        if (activeCount >= MAX_ACTIVE_ADS_PER_USER) {
            await interaction.editReply({
                content: `Já tens ${MAX_ACTIVE_ADS_PER_USER} anúncios activos — o limite por membro. Apaga (\`/marketplace delete\`) ou marca um como vendido (\`/marketplace sold\`) antes de criar um novo.`,
            });
            return;
        }

        if (image && !image.contentType?.startsWith('image/')) {
            await interaction.editReply({ content: 'O ficheiro tem de ser uma imagem.' });
            return;
        }

        const adId = AdId.generate();

        // M5.11 — re-hosted through MinIO *before* the listing is posted,
        // not after: the embed's image is set on the very first render
        // (`renderAdListing`, below), so a raw Discord CDN URL would already
        // be baked into the message by the time anything else could fix it.
        // See AdImageUploader.ts for why this differs from the screenshot
        // gallery's re-host-after-post shape.
        let images: string[] = [];
        if (image) {
            try {
                const durableUrl = await this.adImageUploader.upload(adId.toString(), image.url);
                images = [durableUrl];
            } catch (error) {
                const correlationId = randomUUID();
                this.logger.error('Failed to re-host the sale listing photo', {
                    error,
                    correlationId,
                    authorId: interaction.user.id,
                });
                await interaction.editReply({
                    content: `Não foi possível processar a imagem. Tenta novamente sem imagem ou com outro ficheiro. (ref: ${correlationId})`,
                });
                return;
            }
        }

        // M5.5: the listing is now a rich embed + buttons
        // (`renderAdListing`), not a plain string — built from a throwaway,
        // not-yet-persisted `Ad` holding exactly what is about to be
        // written, so `SellSubcommand` and the bump/edit paths (which render
        // from a real, persisted `Ad`) can never drift from the same
        // renderer.
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
            undefined,
            undefined,
            images,
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
                images,
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
