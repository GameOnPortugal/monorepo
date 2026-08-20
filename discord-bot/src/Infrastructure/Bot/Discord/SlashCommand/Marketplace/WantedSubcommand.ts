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

/**
 * `/marketplace wanted` (M5.7) — restores an old-bot feature (feature-gap
 * G3). Deliberately the same shape as `SellSubcommand` (post-then-persist,
 * one write, routed through `GuildClient` to `📖anuncios`) rather than a
 * shared base class: the two subcommand files already diverge in copy
 * everywhere a string is user-facing, and every other pair of sibling
 * subcommands in this directory (`SoldAdSubcommand`/`BumpAdSubcommand`) is
 * hand-duplicated the same way rather than factored — see those two for the
 * precedent. `renderAdListing()` is what actually stops the embed itself
 * from drifting between `sell` and `wanted` (it is already colour-coded by
 * `adType`, see its doc comment); this file only has to get `adType` right.
 */
@injectable()
export class WantedSubcommand {
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

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // M5.10 — same limit, same rationale (checked before posting, not
        // inside CreateAdHandler) as SellSubcommand; `wanted` and `sell` ads
        // share one pool of "active ads for this member", not separate caps.
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

        // M5.11 — see SellSubcommand.ts's identical block for why this has
        // to happen before the listing is posted.
        let images: string[] = [];
        if (image) {
            try {
                const durableUrl = await this.adImageUploader.upload(adId.toString(), image.url);
                images = [durableUrl];
            } catch (error) {
                const correlationId = randomUUID();
                this.logger.error('Failed to re-host the wanted listing photo', {
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
            'wanted',
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
            this.logger.error('Failed to post wanted listing to the marketplace channel', {
                error,
                correlationId,
                authorId: interaction.user.id,
            });
            await interaction.editReply({
                content: `Não foi possível publicar o teu anúncio de procura. Tenta novamente. (ref: ${correlationId})`,
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
                'wanted',
                images,
            );

            await this.commandHandlerManager.handle(command);
        } catch (error) {
            const correlationId = randomUUID();
            this.logger.error('Failed to persist wanted listing after posting', {
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
            content: `✅ O teu anúncio de procura foi publicado: ${listingUrl}`,
        });
    }
}
