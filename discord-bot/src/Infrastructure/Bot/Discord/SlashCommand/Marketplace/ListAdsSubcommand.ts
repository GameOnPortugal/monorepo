import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import { ListUserAdsPage } from '../../../../../Application/Query/Marketplace/ListUserAdsPage/ListUserAdsPage';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager.ts';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';
import { AdListPresenter } from './AdListPresenter';

const PAGE_SIZE = 10;

/**
 * `/marketplace list` (M5.8) — was a single embed with one field per ad and
 * no cap at all, so a user with 26+ listings broke the command outright
 * (Discord hard-rejects an embed over 25 fields). Replaced the M4.10
 * stopgap (cap at 25, tell the user how many were omitted) with real
 * pagination, following M7.6's `/trophy rank` shape (`RankPresenter` +
 * `TrophyComponentHandler`): a small page (`PAGE_SIZE`, always far under the
 * 25-field cap) plus Prev/Next buttons that re-run this same query. See
 * `AdListPresenter` for the embed/button-building shared with `search`.
 */
@injectable()
export class ListAdsSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(AdListPresenter) private readonly presenter: AdListPresenter,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;

        // Ephemeral for the whole command (M5.8 settles `/marketplace list`
        // as ephemeral going forward), so every path below — including the
        // error/no-ads paths (M0.3) — stays ephemeral without exception.
        await context.interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const adPage = await this.commandHandlerManager.handle(
                new ListUserAdsPage(targetUser.id, 1, PAGE_SIZE),
            );

            if (adPage.totalCount === 0) {
                await context.interaction.editReply({
                    content:
                        targetUser.id === context.interaction.user.id
                            ? 'Não tens nenhum anúncio activo.'
                            : 'Este utilizador não tem nenhum anúncio activo.',
                });
                return;
            }

            const title = `Anúncios de ${targetUser.username}`;
            const embed = this.presenter.buildAdListEmbed({
                title,
                description: `${adPage.totalCount} anúncio${adPage.totalCount === 1 ? '' : 's'} encontrado${adPage.totalCount === 1 ? '' : 's'}`,
                adPage,
                guildId: context.interaction.guildId,
            });
            const row = this.presenter.buildListPaginationRow(targetUser.id, adPage);

            await context.interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
            this.logger.error('Error listing ads', { error });
            await safeReply(context.interaction, {
                content: 'Ocorreu um erro ao obter os anúncios. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
