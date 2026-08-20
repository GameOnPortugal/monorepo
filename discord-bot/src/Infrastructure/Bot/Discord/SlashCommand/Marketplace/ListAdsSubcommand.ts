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
                return 'Novo';
            case 'like_new':
                return 'Como novo';
            case 'used_good':
                return 'Usado - Bom estado';
            case 'used_marks':
                return 'Usado - Com marcas';
            case 'broken':
                return 'Avariado';
            default:
                return state;
        }
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;

        // Ephemeral for the whole command (M5.8 already settles `/marketplace
        // list` as ephemeral going forward, so this moves toward the settled
        // design rather than away from it). This also keeps every path below
        // ephemeral without exception, so there is no ephemeral-to-public
        // leak on the error/no-ads paths (M0.3).
        await context.interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const ads = await this.commandHandlerManager.handle(new ListUserAds(targetUser.id));

            if (ads.length === 0) {
                await context.interaction.editReply({
                    content:
                        targetUser.id === context.interaction.user.id
                            ? 'Não tens nenhum anúncio activo.'
                            : 'Este utilizador não tem nenhum anúncio activo.',
                });
                return;
            }

            const title = `Anúncios de ${targetUser.username}`;
            const description = `${ads.length} anúncio${ads.length === 1 ? '' : 's'} activo${ads.length === 1 ? '' : 's'} encontrado${ads.length === 1 ? '' : 's'}`;

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
                        `💰 Preço: ${ad.price}`,
                        `📍 Zona: ${ad.zone}`,
                        `🚚 Envio: ${ad.dispatch}`,
                        `🆔 ID: ${ad.id.toString()}`,
                        ad.warranty ? `⚡ Garantia: ${ad.warranty}` : null,
                        ad.description ? `📝 ${ad.description}` : null,
                        `\n[Ver anúncio](https://discord.com/channels/${context.interaction.guildId}/${ad.channelId}/${ad.messageId})`,
                    ]
                        .filter(Boolean)
                        .join('\n'),
                }),
                title.length + description.length,
            );
            embed.addFields(fields);

            if (omittedCount > 0) {
                embed.setFooter({
                    text: `A mostrar ${fields.length} de ${ads.length} anúncios — ${omittedCount} omitidos. Restringe a pesquisa ou pede ajuda a um admin para ver os restantes.`,
                });
            }

            await context.interaction.editReply({ embeds: [embed] });
        } catch (error) {
            this.logger.error('Error listing ads', { error });
            await safeReply(context.interaction, {
                content: 'Ocorreu um erro ao obter os anúncios. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
