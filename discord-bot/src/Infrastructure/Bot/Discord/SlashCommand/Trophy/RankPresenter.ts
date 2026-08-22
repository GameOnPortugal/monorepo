import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildCustomId } from '../../../../../Domain/Bot/CustomId.ts';
import type { RankPage } from '../../../../../Domain/Trophy/RankPage';
import type { UserPosition } from '../../../../../Domain/Trophy/UserPosition';
import type { RankType } from '../../../../../Application/Query/Trophy/GetRank/GetRank';
import { formatRankPositionEmoji } from './RankEmoji.ts';
import { messages, type BotMessages } from '../../../../../Domain/Bot/I18n/messages';
import type { BotLocale } from '../../../../../Domain/Bot/I18n/BotLocale';

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
    private formatNumber(num: number, locale: BotLocale): string {
        return num.toLocaleString(messages(locale).intlLocale);
    }

    private formatRankTitle(m: BotMessages['trophy'], type: RankType): string {
        switch (type) {
            case 'monthly':
                return m.monthlyRankTitle;
            case 'creation':
                return m.creationRankTitle;
            case 'lifetime':
                return m.lifetimeRankTitle;
            case 'user':
                return m.userRankTitle;
            default:
                return m.genericRankTitle;
        }
    }

    private formatMonthYear(date: Date, locale: BotLocale): string {
        return date.toLocaleDateString(messages(locale).intlLocale, {
            month: 'long',
            year: 'numeric',
        });
    }

    public buildRankingEmbed(
        rankPage: RankPage,
        type: RankType,
        date?: Date,
        locale: BotLocale = 'pt',
    ): EmbedBuilder {
        const m = messages(locale).trophy;
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(this.formatRankTitle(m, type))
            .setTimestamp();

        if (type === 'monthly' && date) {
            embed.setTitle(
                `${this.formatRankTitle(m, type)} — ${this.formatMonthYear(date, locale)}`,
            );
        }

        if (rankPage.data.length === 0) {
            embed.setDescription(m.noTrophiesForPeriod);
        } else {
            const firstRow = (rankPage.page - 1) * rankPage.pageSize;
            embed.setDescription(
                rankPage.data
                    .map((rank, index) => {
                        const position = firstRow + index + 1;
                        const mention = rank.userId ? ` (<@${rank.userId}>)` : '';
                        return (
                            `${formatRankPositionEmoji(position)} **#${position}** ${rank.psnProfile}${mention}\n` +
                            m.pointsAndTrophies(
                                this.formatNumber(rank.points, locale),
                                this.formatNumber(rank.num_trophies, locale),
                            )
                        );
                    })
                    .join('\n\n'),
            );
        }

        embed.setFooter({
            text: m.rankFooter(
                rankPage.page,
                rankPage.totalPages,
                this.formatNumber(rankPage.totalCount, locale),
            ),
        });

        return embed;
    }

    public buildUserPositionEmbed(
        data: UserPosition,
        targetUser: string,
        locale: BotLocale = 'pt',
    ): EmbedBuilder {
        const m = messages(locale).trophy;
        const position = (index: 0 | 1 | 2, whenEmpty: string): string =>
            data.ranks[index].position > 0
                ? m.positionLine(
                      formatRankPositionEmoji(data.ranks[index].position),
                      data.ranks[index].position,
                      this.formatNumber(data.ranks[index].points, locale),
                      this.formatNumber(data.ranks[index].trophies, locale),
                  )
                : whenEmpty;

        return new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(m.userRankingTitle(targetUser))
            .addFields(
                {
                    name: m.monthlyRankField,
                    value: position(0, m.noTrophiesThisMonth),
                    inline: true,
                },
                {
                    name: m.creationRankField,
                    value: position(1, m.noTrophiesRecorded),
                    inline: true,
                },
                {
                    name: m.lifetimeRankField,
                    value: position(2, m.noTrophiesRecorded),
                    inline: true,
                },
                {
                    name: m.totalsField,
                    value: m.totalsLine(
                        this.formatNumber(data.totalPoints, locale),
                        this.formatNumber(data.totalTrophies, locale),
                    ),
                    inline: false,
                },
            )
            .setFooter({ text: m.rankFooterLabel })
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
        locale: BotLocale = 'pt',
    ): ActionRowBuilder<ButtonBuilder> {
        const common = messages(locale).common;
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
            .setLabel(common.previousButton)
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
            .setLabel(common.nextButton)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(rankPage.page >= rankPage.totalPages);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton);
    }
}
