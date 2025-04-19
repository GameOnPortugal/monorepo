import {inject, injectable} from "inversify";
import type {SlashCommandContext} from "../../../../../Domain/Bot/SlashCommandContext";
import {EmbedBuilder, MessageFlags} from "discord.js";
import {TYPES} from "../../../../DependencyInjection/types";
import type Logger from "../../../../../Application/Logger/Logger";
import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager";
import {GetRank, type RankType, type MonthOption} from "../../../../../Application/Query/Trophy/GetRank/GetRank";
import type {TrophyRankData} from "../../../../../Domain/Trophy/TrophyRankData";
import type {UserPosition} from "../../../../../Domain/Trophy/UserPosition";

@injectable()
export class RankSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
    ) {}

    private formatNumber(num: number): string {
        return num.toLocaleString('pt-PT');
    }

    private getRankEmoji(position: number): string {
        switch (position) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return '🏅';
        }
    }

    private formatRankTitle(type: RankType, targetUser?: string): string {
        switch (type) {
            case 'monthly': return '📅 Monthly Trophy Rankings';
            case 'creation': return '🎮 Since Creation Trophy Rankings';
            case 'lifetime': return '🏆 Lifetime Trophy Rankings';
            case 'user': return `📊 ${targetUser}'s Trophy Rankings`;
            default: return 'Trophy Rankings';
        }
    }

    private getMonthDate(monthOption: string | null, yearOption: string | null): Date {
        const now = new Date();
        const year = yearOption ? parseInt(yearOption) : now.getFullYear();
        
        if (!monthOption) {
            return new Date(year, now.getMonth());
        }

        if (monthOption === 'last') {
            const lastMonth = new Date(now);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            return new Date(year, lastMonth.getMonth());
        }

        const monthNumber = parseInt(monthOption);
        if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
            return new Date(year, monthNumber - 1);
        }

        return new Date(year, now.getMonth());
    }

    private formatMonthYear(date: Date): string {
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    private async createRankingEmbed(data: TrophyRankData[], type: RankType, date?: Date): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(this.formatRankTitle(type))
            .setTimestamp();

        if (type === 'monthly' && date) {
            embed.setTitle(`${this.formatRankTitle(type)} - ${this.formatMonthYear(date)}`);
        }

        if (data.length === 0) {
            embed.setDescription('No trophies found for this period.');
        } else {
            embed.setDescription(data.map((rank, index) => {
                const position = index + 1;
                return `${this.getRankEmoji(position)} **#${position}** ${rank.psnProfile}\n` +
                    `Points: ${this.formatNumber(rank.points)} | Trophies: ${this.formatNumber(rank.num_trophies)}`;
            }).join('\n\n'))
            .setFooter({text: `Top ${data.length} Trophy Hunters`});
        }

        return embed;
    }

    private createUserPositionEmbed(data: UserPosition, targetUser: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📊 ${targetUser}'s Trophy Rankings`)
            .addFields(
                {
                    name: '📅 Monthly Rank',
                    value: data.ranks[0].position > 0
                        ? `${this.getRankEmoji(data.ranks[0].position)} #${data.ranks[0].position}\nPoints: ${this.formatNumber(data.ranks[0].points)}\nTrophies: ${this.formatNumber(data.ranks[0].trophies)}`
                        : 'No trophies this month',
                    inline: true
                },
                {
                    name: '🎮 Since Creation',
                    value: data.ranks[1].position > 0
                        ? `${this.getRankEmoji(data.ranks[1].position)} #${data.ranks[1].position}\nPoints: ${this.formatNumber(data.ranks[1].points)}\nTrophies: ${this.formatNumber(data.ranks[1].trophies)}`
                        : 'No trophies recorded',
                    inline: true
                },
                {
                    name: '🏆 Lifetime',
                    value: data.ranks[2].position > 0
                        ? `${this.getRankEmoji(data.ranks[2].position)} #${data.ranks[2].position}\nPoints: ${this.formatNumber(data.ranks[2].points)}\nTrophies: ${this.formatNumber(data.ranks[2].trophies)}`
                        : 'No trophies recorded',
                    inline: true
                },
                {
                    name: '📊 Total Stats',
                    value: `Total Points: ${this.formatNumber(data.totalPoints)}\nTotal Trophies: ${this.formatNumber(data.totalTrophies)}`,
                    inline: false
                }
            )
            .setFooter({text: 'Trophy Rankings'})
            .setTimestamp();
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        try {
            const type = context.interaction.options.getString('type', true) as RankType;
            const limit = context.interaction.options.getInteger('limit') ?? 10;
            const monthOption = type === 'monthly' ? context.interaction.options.getString('month') : null;
            const yearOption = type === 'monthly' ? context.interaction.options.getString('year') : null;
            const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;
            const date = this.getMonthDate(monthOption, yearOption);

            const result = await this.commandHandlerManager.handle(new GetRank(
                type,
                targetUser?.id,
                limit,
                monthOption as MonthOption,
                yearOption ? parseInt(yearOption) : undefined,
            ));

            const embed = Array.isArray(result)
                ? await this.createRankingEmbed(result, type, type === 'monthly' ? date : undefined)
                : this.createUserPositionEmbed(result, targetUser?.username ?? 'Unknown');

            await context.interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            this.logger.error('Error getting trophy ranks', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });

            await context.interaction.reply({
                content: '⚠️ An error occurred while retrieving the trophy rankings. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
