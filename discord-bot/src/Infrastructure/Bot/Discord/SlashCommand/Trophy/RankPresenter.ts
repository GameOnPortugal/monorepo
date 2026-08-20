import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildCustomId } from '../../../../../Domain/Bot/CustomId.ts';
import type { RankPage } from '../../../../../Domain/Trophy/RankPage';
import type { UserPosition } from '../../../../../Domain/Trophy/UserPosition';
import type { RankType } from '../../../../../Application/Query/Trophy/GetRank/GetRank';
import { formatRankPositionEmoji } from './RankEmoji.ts';

/** `trophies:page:<type>:<page>:<pageSize>:<month>:<year>` — see `TrophyComponentHandler`. */
export const RANK_NAMESPACE = 'trophies';
export const RANK_PAGE_ACTION = 'page';

/** Placeholder segment for a custom-ID slot that does not apply to this rank type. */
const NOT_APPLICABLE = '-';

/**
 * Everything about turning a `RankPage`/`UserPosition` into what a member
 * sees — embed content and, for the paginated list types, the Prev/Next row
 * (M7.6). Shared between `RankSubcommand` (the initial `/trophy rank`
 * invocation) and `TrophyComponentHandler` (a click on one of the buttons
 * this class built) so the two never drift into rendering a page
 * differently depending on how it was reached.
 */
export class RankPresenter {
    private formatNumber(num: number): string {
        return num.toLocaleString('pt-PT');
    }

    private formatRankTitle(type: RankType): string {
        switch (type) {
            case 'monthly':
                return '📅 Ranking Mensal de Troféus';
            case 'creation':
                return '🎮 Ranking de Troféus Desde Sempre';
            case 'lifetime':
                return '🏆 Ranking Vitalício de Troféus';
            case 'user':
                return '📊 Ranking de Troféus';
            default:
                return 'Ranking de Troféus';
        }
    }

    private formatMonthYear(date: Date): string {
        return date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    }

    public buildRankingEmbed(rankPage: RankPage, type: RankType, date?: Date): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(this.formatRankTitle(type))
            .setTimestamp();

        if (type === 'monthly' && date) {
            embed.setTitle(`${this.formatRankTitle(type)} — ${this.formatMonthYear(date)}`);
        }

        if (rankPage.data.length === 0) {
            embed.setDescription('Sem troféus registados para este período.');
        } else {
            const firstRow = (rankPage.page - 1) * rankPage.pageSize;
            embed.setDescription(
                rankPage.data
                    .map((rank, index) => {
                        const position = firstRow + index + 1;
                        const mention = rank.userId ? ` (<@${rank.userId}>)` : '';
                        return (
                            `${formatRankPositionEmoji(position)} **#${position}** ${rank.psnProfile}${mention}\n` +
                            `Pontos: ${this.formatNumber(rank.points)} | Troféus: ${this.formatNumber(rank.num_trophies)}`
                        );
                    })
                    .join('\n\n'),
            );
        }

        embed.setFooter({
            text: `Página ${rankPage.page} de ${rankPage.totalPages} • ${this.formatNumber(rankPage.totalCount)} jogador(es) no ranking`,
        });

        return embed;
    }

    public buildUserPositionEmbed(data: UserPosition, targetUser: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(`📊 Ranking de ${targetUser}`)
            .addFields(
                {
                    name: '📅 Rank Mensal',
                    value:
                        data.ranks[0].position > 0
                            ? `${formatRankPositionEmoji(data.ranks[0].position)} #${data.ranks[0].position}\nPontos: ${this.formatNumber(data.ranks[0].points)}\nTroféus: ${this.formatNumber(data.ranks[0].trophies)}`
                            : 'Sem troféus este mês',
                    inline: true,
                },
                {
                    name: '🎮 Desde Sempre',
                    value:
                        data.ranks[1].position > 0
                            ? `${formatRankPositionEmoji(data.ranks[1].position)} #${data.ranks[1].position}\nPontos: ${this.formatNumber(data.ranks[1].points)}\nTroféus: ${this.formatNumber(data.ranks[1].trophies)}`
                            : 'Sem troféus registados',
                    inline: true,
                },
                {
                    name: '🏆 Vitalício',
                    value:
                        data.ranks[2].position > 0
                            ? `${formatRankPositionEmoji(data.ranks[2].position)} #${data.ranks[2].position}\nPontos: ${this.formatNumber(data.ranks[2].points)}\nTroféus: ${this.formatNumber(data.ranks[2].trophies)}`
                            : 'Sem troféus registados',
                    inline: true,
                },
                {
                    name: '📊 Totais',
                    value: `Pontos totais: ${this.formatNumber(data.totalPoints)}\nTroféus totais: ${this.formatNumber(data.totalTrophies)}`,
                    inline: false,
                },
            )
            .setFooter({ text: 'Ranking de Troféus' })
            .setTimestamp();
    }

    /**
     * Always returns a row for the paginated list types (monthly / creation
     * / lifetime) — including when there is only one page, with both
     * buttons disabled, rather than omitting the row entirely. A member
     * should never wonder whether pagination exists on a given leaderboard;
     * it either lets them move, or visibly can't.
     *
     * Custom IDs are built only through `buildCustomId()` (never string
     * concatenation) and carry every bit of state needed to reconstruct the
     * exact same query after a bot restart: type, target page, page size,
     * and — for monthly — the *resolved* month/year (not "current"/"last",
     * which are relative to whenever the button happens to be clicked).
     */
    public buildPaginationRow(
        type: RankType,
        rankPage: RankPage,
        month?: number,
        year?: number,
    ): ActionRowBuilder<ButtonBuilder> {
        const monthArg = type === 'monthly' && month ? String(month) : NOT_APPLICABLE;
        const yearArg = type === 'monthly' && year ? String(year) : NOT_APPLICABLE;

        const prevPage = Math.max(1, rankPage.page - 1);
        const nextPage = Math.min(rankPage.totalPages, rankPage.page + 1);

        const previousButton = new ButtonBuilder()
            .setCustomId(
                buildCustomId(
                    RANK_NAMESPACE,
                    RANK_PAGE_ACTION,
                    type,
                    String(prevPage),
                    String(rankPage.pageSize),
                    monthArg,
                    yearArg,
                ),
            )
            .setLabel('◀ Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(rankPage.page <= 1);

        const nextButton = new ButtonBuilder()
            .setCustomId(
                buildCustomId(
                    RANK_NAMESPACE,
                    RANK_PAGE_ACTION,
                    type,
                    String(nextPage),
                    String(rankPage.pageSize),
                    monthArg,
                    yearArg,
                ),
            )
            .setLabel('Próxima ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(rankPage.page >= rankPage.totalPages);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton);
    }
}
