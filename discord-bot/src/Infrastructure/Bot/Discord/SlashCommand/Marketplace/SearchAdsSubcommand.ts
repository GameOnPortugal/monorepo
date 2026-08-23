import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { SearchAds } from '../../../../../Application/Query/Marketplace/SearchAds/SearchAds';
import type { AdSearchCriteria } from '../../../../../Domain/Marketplace/AdSearchCriteria';
import { safeReply } from '../../../../../Domain/Bot/safeReply';
import { AdListPresenter } from './AdListPresenter';
import { SearchCriteriaStore } from '../../Component/Marketplace/SearchCriteriaStore';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages';
import { localeOf } from '../../../../../Domain/Bot/I18n/BotLocale';

const PAGE_SIZE = 10;

/**
 * `/marketplace search` (M5.9) — the marketplace had no browse surface at
 * all before this: `/marketplace list` only ever showed one member's own
 * ads. Ephemeral, like `list` (M5.8): a search is a personal query, not
 * something that belongs posted into `📖anuncios` on every use.
 */
@injectable()
export class SearchAdsSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(AdListPresenter) private readonly presenter: AdListPresenter,
        @inject(SearchCriteriaStore) private readonly searchCriteriaStore: SearchCriteriaStore,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const m = messagesFor(interaction).marketplace;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const keyword = interaction.options.getString('keyword') ?? undefined;
            const zone = interaction.options.getString('zone') ?? undefined;
            const adType = interaction.options.getString('type') ?? undefined;
            const condition = interaction.options.getString('condition') ?? undefined;
            const maxPrice = interaction.options.getInteger('max_price');

            const criteria: AdSearchCriteria = {
                ...(keyword ? { keyword } : {}),
                ...(zone ? { zone } : {}),
                ...(adType ? { adType } : {}),
                ...(condition ? { condition } : {}),
                ...(maxPrice !== null ? { maxPriceCents: maxPrice * 100 } : {}),
            };

            const adPage = await this.commandHandlerManager.handle(
                new SearchAds(criteria, 1, PAGE_SIZE),
            );

            if (adPage.totalCount === 0) {
                await interaction.editReply({ content: m.searchNoResults });
                return;
            }

            const token = this.searchCriteriaStore.put(criteria, PAGE_SIZE);
            const embed = this.presenter.buildAdListEmbed({
                title: m.searchResultsTitle,
                description: m.activeAdsFound(adPage.totalCount),
                adPage,
                guildId: interaction.guildId,
                showOwner: true,
                locale: localeOf(interaction),
            });
            const row = this.presenter.buildSearchPaginationRow(
                token,
                adPage,
                localeOf(interaction),
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
            this.logger.error('Error searching ads', { error });
            await safeReply(interaction, {
                content: m.searchError,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
