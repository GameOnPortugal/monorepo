import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import {
    GetRank,
    type RankType,
    type MonthOption,
} from '../../../../../Application/Query/Trophy/GetRank/GetRank';
import type { RankPage } from '../../../../../Domain/Trophy/RankPage';
import type { UserPosition } from '../../../../../Domain/Trophy/UserPosition';
import { safeReply } from '../../../../../Domain/Bot/safeReply';
import { RankPresenter } from './RankPresenter.ts';

function isRankPage(result: RankPage | UserPosition): result is RankPage {
    return 'data' in result;
}

@injectable()
export class RankSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(RankPresenter) private readonly presenter: RankPresenter,
    ) {}

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

    public async handle(context: SlashCommandContext): Promise<void> {
        // Deferred first: this can load up to 1000 profiles (GetRank), which
        // can take longer than the 3s interaction-ack window.
        await context.interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const type = context.interaction.options.getString('type', true) as RankType;
            // `limit` is now a page *size*, not a hard cap on the whole
            // ranking (M7.6) — pagination buttons replace what used to be
            // the only way to see past position 10. Kept as an option
            // (rather than dropped) because "show me 3 at a time" /
            // "show me 10 at a time" is still a real preference, and it
            // costs nothing to keep once the buttons carry it in their
            // custom IDs for every subsequent page.
            const limit = context.interaction.options.getInteger('limit') ?? 10;
            const monthOption =
                type === 'monthly' ? context.interaction.options.getString('month') : null;
            const yearOption =
                type === 'monthly' ? context.interaction.options.getString('year') : null;
            const targetUser =
                context.interaction.options.getUser('user') ?? context.interaction.user;
            const date = this.getMonthDate(monthOption, yearOption);

            const result = await this.commandHandlerManager.handle(
                new GetRank(
                    type,
                    targetUser?.id,
                    limit,
                    monthOption as MonthOption,
                    yearOption ? parseInt(yearOption) : undefined,
                    1,
                ),
            );

            if (isRankPage(result)) {
                const embed = this.presenter.buildRankingEmbed(
                    result,
                    type,
                    type === 'monthly' ? date : undefined,
                );
                const row = this.presenter.buildPaginationRow(
                    type,
                    result,
                    type === 'monthly' ? date.getMonth() + 1 : undefined,
                    type === 'monthly' ? date.getFullYear() : undefined,
                );

                await context.interaction.editReply({
                    embeds: [embed],
                    components: [row],
                });
                return;
            }

            const embed = this.presenter.buildUserPositionEmbed(
                result,
                targetUser?.username ?? 'Unknown',
            );

            await context.interaction.editReply({
                embeds: [embed],
            });
        } catch (error) {
            this.logger.error('Error getting trophy ranks', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            });

            await safeReply(context.interaction, {
                content:
                    '⚠️ Ocorreu um erro ao obter o ranking de troféus. Tenta novamente mais tarde.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
