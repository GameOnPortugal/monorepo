import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { MessageFlags, type AnySelectMenuInteraction, type ButtonInteraction } from 'discord.js';
import type { ComponentHandler } from '../../../../../Domain/Bot/ComponentHandler';
import type {
    ComponentInteractionContext,
    ModalInteractionContext,
} from '../../../../../Domain/Bot/InteractionContext';
import { parseCustomId } from '../../../../../Domain/Bot/CustomId';
import { isGuildAdmin } from '../../../../../Domain/Bot/AdminCheck';
import { safeReply } from '../../../../../Domain/Bot/safeReply';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { InvalidId } from '../../../../../Domain/InvalidId';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { UnauthorizedAdAction } from '../../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../../Domain/Marketplace/AdNotActive';
import { AdBumpRateLimited } from '../../../../../Domain/Marketplace/AdBumpRateLimited';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { GetAd } from '../../../../../Application/Query/Marketplace/GetAd/GetAd';
import { MarkAdSold } from '../../../../../Application/Write/Marketplace/MarkAdSold/MarkAdSold';
import { BumpAd } from '../../../../../Application/Write/Marketplace/BumpAd/BumpAd';
import { EditAd } from '../../../../../Application/Write/Marketplace/EditAd/EditAd';
import { ListUserAdsPage } from '../../../../../Application/Query/Marketplace/ListUserAdsPage/ListUserAdsPage';
import { SearchAds } from '../../../../../Application/Query/Marketplace/SearchAds/SearchAds';
import { DiscordChannels } from '../../../../Community/Discord/DiscordChannels';
import { formatHoursRemaining } from '../../SlashCommand/Marketplace/formatHoursRemaining';
import {
    AdListPresenter,
    LIST_PAGE_ACTION,
    SEARCH_PAGE_ACTION,
} from '../../SlashCommand/Marketplace/AdListPresenter';
import { SearchCriteriaStore } from './SearchCriteriaStore';

/**
 * The `mkt` namespace (M4.7's first real consumer): the three listing
 * buttons from M5.5 (`contact`, `sold`, `bump`) plus the `edit-submit` modal
 * submission from M5.6's `/marketplace edit`. One handler, dispatching
 * internally on the parsed action — see `ComponentHandler.ts`'s doc comment
 * for why that beats one handler per button.
 *
 * `sold`/`bump`/`edit-submit` share the exact same `Application/Write`
 * command/handlers as the matching slash subcommands
 * (`SoldAdSubcommand`/`BumpAdSubcommand`/`EditAdSubcommand`) — this file
 * only ever builds a command from a button/modal interaction instead of a
 * `ChatInputCommandInteraction`, never reimplements the rule itself.
 *
 * Every action re-derives authorisation from the ad row itself
 * (`command.userId` compared against `ad.authorId`, `isGuildAdmin()` read
 * off the *interaction's* live permission bits) — the custom ID only ever
 * carries the ad id, never anything that looks like an authorisation claim.
 * See `CustomId.ts`.
 */
@injectable()
export class MarketplaceComponentHandler implements ComponentHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(AdListPresenter) private readonly presenter: AdListPresenter,
        @inject(SearchCriteriaStore) private readonly searchCriteriaStore: SearchCriteriaStore,
    ) {}

    getNamespace(): string {
        return 'mkt';
    }

    async handle(context: ComponentInteractionContext | ModalInteractionContext): Promise<void> {
        const { interaction } = context;
        const parsed = parseCustomId(interaction.customId);

        // BotExecutor already validated this before routing here — kept
        // defensive rather than assumed, since a handler must never crash on
        // untrusted client-supplied input (CustomId.ts).
        if (!parsed) {
            return;
        }

        // M5.8/M5.9 — the two pagination actions carry a target user id / a
        // SearchCriteriaStore token in args[0], never an AdId, so they are
        // dispatched before the AdId parse every other action below needs.
        if (parsed.action === LIST_PAGE_ACTION) {
            await this.handleListPage(
                interaction as ButtonInteraction | AnySelectMenuInteraction,
                parsed.args,
            );
            return;
        }
        if (parsed.action === SEARCH_PAGE_ACTION) {
            await this.handleSearchPage(
                interaction as ButtonInteraction | AnySelectMenuInteraction,
                parsed.args,
            );
            return;
        }

        let adId: AdId;
        try {
            adId = AdId.fromString((parsed.args[0] ?? '').trim());
        } catch (error) {
            if (error instanceof InvalidId) {
                await safeReply(interaction, {
                    content: 'ID de anúncio inválido.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            throw error;
        }

        switch (parsed.action) {
            case 'contact':
                await this.handleContact(
                    interaction as ButtonInteraction | AnySelectMenuInteraction,
                    adId,
                );
                return;
            case 'sold':
                await this.handleSold(
                    interaction as ButtonInteraction | AnySelectMenuInteraction,
                    adId,
                );
                return;
            case 'bump':
                await this.handleBump(
                    interaction as ButtonInteraction | AnySelectMenuInteraction,
                    adId,
                );
                return;
            case 'edit-submit':
                await this.handleEditSubmit(context as ModalInteractionContext, adId);
                return;
            default:
                this.logger.warn('Unknown mkt component action', { action: parsed.action });
                await safeReply(interaction, {
                    content: 'Esta ação já não está disponível.',
                    flags: MessageFlags.Ephemeral,
                });
        }
    }

    /**
     * `mkt:list-page:<targetUserId>:<page>:<pageSize>` (M5.8). No ownership
     * check needed: the message this button lives on is always `list`'s own
     * ephemeral reply, which only the invoking member can see or click —
     * same reasoning as `TrophyComponentHandler`'s pagination buttons.
     * Numeric args fall back to page 1 / the default page size rather than
     * propagating `NaN` if the custom ID is somehow malformed.
     */
    private async handleListPage(
        interaction: ButtonInteraction | AnySelectMenuInteraction,
        args: string[],
    ): Promise<void> {
        const [targetUserId, pageArg, pageSizeArg] = args;
        if (!targetUserId) {
            await safeReply(interaction, {
                content:
                    '⚠️ Este botão de paginação já não é válido. Corre `/marketplace list` outra vez.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const page = toPositiveInt(pageArg, 1);
        const pageSize = toPositiveInt(pageSizeArg, 10);

        try {
            const adPage = await this.commandHandlerManager.handle(
                new ListUserAdsPage(targetUserId, page, pageSize),
            );
            const embed = this.presenter.buildAdListEmbed({
                title: `Anúncios de ${interaction.user.id === targetUserId ? interaction.user.username : targetUserId}`,
                description: `${adPage.totalCount} anúncio${adPage.totalCount === 1 ? '' : 's'} encontrado${adPage.totalCount === 1 ? '' : 's'}`,
                adPage,
                guildId: interaction.guildId,
            });
            const row = this.presenter.buildListPaginationRow(targetUserId, adPage);

            await (interaction as ButtonInteraction).update({ embeds: [embed], components: [row] });
        } catch (error) {
            this.logger.error('Error handling marketplace list pagination click', {
                error,
                customId: interaction.customId,
                userId: interaction.user.id,
            });
            await safeReply(interaction, {
                content: '⚠️ Ocorreu um erro ao mudar de página. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    /**
     * `mkt:search-page:<token>:<page>` (M5.9). A missing/expired token
     * (`SearchCriteriaStore`'s TTL, or a bot restart) fails closed with an
     * ephemeral prompt to search again, rather than a stale or empty
     * render — see that class's doc comment for why search pagination
     * can't just carry its own criteria the way `list-page` does.
     */
    private async handleSearchPage(
        interaction: ButtonInteraction | AnySelectMenuInteraction,
        args: string[],
    ): Promise<void> {
        const [token, pageArg] = args;
        const stored = token ? this.searchCriteriaStore.get(token) : null;

        if (!stored) {
            await safeReply(interaction, {
                content: '⚠️ Esta pesquisa expirou. Corre `/marketplace search` outra vez.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const page = toPositiveInt(pageArg, 1);

        try {
            const adPage = await this.commandHandlerManager.handle(
                new SearchAds(stored.criteria, page, stored.pageSize),
            );
            const embed = this.presenter.buildAdListEmbed({
                title: '🔎 Resultados da pesquisa',
                description: `${adPage.totalCount} anúncio${adPage.totalCount === 1 ? '' : 's'} activo${adPage.totalCount === 1 ? '' : 's'} encontrado${adPage.totalCount === 1 ? '' : 's'}`,
                adPage,
                guildId: interaction.guildId,
                showOwner: true,
            });
            const row = this.presenter.buildSearchPaginationRow(token as string, adPage);

            await (interaction as ButtonInteraction).update({ embeds: [embed], components: [row] });
        } catch (error) {
            this.logger.error('Error handling marketplace search pagination click', {
                error,
                customId: interaction.customId,
                userId: interaction.user.id,
            });
            await safeReply(interaction, {
                content: '⚠️ Ocorreu um erro ao mudar de página. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    private async handleContact(
        interaction: ButtonInteraction | AnySelectMenuInteraction,
        adId: AdId,
    ): Promise<void> {
        try {
            const ad = await this.commandHandlerManager.handle(new GetAd(adId));
            const profileUrl = `https://discord.com/users/${ad.authorId}`;
            await interaction.reply({
                content: `💬 Contacta o vendedor pelo perfil: ${profileUrl}`,
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            if (error instanceof RecordNotFound) {
                await interaction.reply({
                    content: 'Este anúncio já não existe.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            throw error;
        }
    }

    private async handleSold(
        interaction: ButtonInteraction | AnySelectMenuInteraction,
        adId: AdId,
    ): Promise<void> {
        const isAdmin = isGuildAdmin(interaction);
        await interaction.deferUpdate();

        try {
            await this.commandHandlerManager.handle(
                new MarkAdSold(adId, interaction.user.id, isAdmin),
            );
            await interaction.followUp({
                content: '✅ Anúncio marcado como vendido.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            await this.followUpWithError(
                interaction,
                error,
                adId,
                'marcar este anúncio como vendido',
            );
        }
    }

    private async handleBump(
        interaction: ButtonInteraction | AnySelectMenuInteraction,
        adId: AdId,
    ): Promise<void> {
        await interaction.deferUpdate();

        try {
            await this.commandHandlerManager.handle(
                new BumpAd(adId, interaction.user.id, DiscordChannels.MARKETPLACE),
            );
            await interaction.followUp({
                content: '🔄 Anúncio renovado.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            if (error instanceof AdBumpRateLimited) {
                await interaction.followUp({
                    content: `Só podes renovar este anúncio uma vez a cada 72 horas. Tenta novamente daqui a ${formatHoursRemaining(error.nextEligibleAt)}.`,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await this.followUpWithError(interaction, error, adId, 'renovar este anúncio');
        }
    }

    private async handleEditSubmit(context: ModalInteractionContext, adId: AdId): Promise<void> {
        const { interaction } = context;
        const price = interaction.fields.getTextInputValue('price');
        const description = interaction.fields.getTextInputValue('description');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            await this.commandHandlerManager.handle(
                new EditAd(adId, interaction.user.id, price, description),
            );
            await interaction.editReply({ content: '✏️ Anúncio actualizado.' });
        } catch (error) {
            if (error instanceof UnauthorizedAdAction) {
                await interaction.editReply({
                    content: 'Não tens permissão para editar este anúncio.',
                });
            } else if (error instanceof AdNotActive) {
                await interaction.editReply({ content: 'Este anúncio já não está activo.' });
            } else if (error instanceof RecordNotFound) {
                await interaction.editReply({ content: 'Anúncio não encontrado.' });
            } else {
                const correlationId = randomUUID();
                this.logger.error('Error editing ad', {
                    error,
                    correlationId,
                    adId: adId.toString(),
                    userId: interaction.user.id,
                });
                await interaction.editReply({
                    content: `Ocorreu um erro ao editar o anúncio. Tenta novamente. (ref: ${correlationId})`,
                });
            }
        }
    }

    /**
     * Shared error -> ephemeral-followUp mapping for the two button actions
     * that write (`sold`/`bump`) — both defer first, so both answer through
     * `followUp`, not `reply`/`editReply`.
     */
    private async followUpWithError(
        interaction: ButtonInteraction | AnySelectMenuInteraction,
        error: unknown,
        adId: AdId,
        actionDescription: string,
    ): Promise<void> {
        if (error instanceof UnauthorizedAdAction) {
            await interaction.followUp({
                content: `Não tens permissão para ${actionDescription}.`,
                flags: MessageFlags.Ephemeral,
            });
        } else if (error instanceof AdNotActive) {
            await interaction.followUp({
                content: 'Este anúncio já não está activo.',
                flags: MessageFlags.Ephemeral,
            });
        } else if (error instanceof RecordNotFound) {
            await interaction.followUp({
                content: 'Este anúncio já não existe.',
                flags: MessageFlags.Ephemeral,
            });
        } else {
            const correlationId = randomUUID();
            this.logger.error(`Error trying to ${actionDescription}`, {
                error,
                correlationId,
                adId: adId.toString(),
                userId: interaction.user.id,
            });
            await interaction.followUp({
                content: `Ocorreu um erro. Tenta novamente. (ref: ${correlationId})`,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
