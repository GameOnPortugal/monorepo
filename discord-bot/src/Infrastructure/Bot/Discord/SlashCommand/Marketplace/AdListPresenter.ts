import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildCustomId } from '../../../../../Domain/Bot/CustomId';
import type { Ad } from '../../../../../Domain/Marketplace/Ad';
import type { AdPage } from '../../../../../Domain/Marketplace/AdPage';
import { capFields, truncateFieldValue } from '../../../../../Domain/Bot/embedLimits';

/** `mkt:list-page:<targetUserId>:<page>:<pageSize>` — see MarketplaceComponentHandler. */
export const LIST_PAGE_ACTION = 'list-page';
/** `mkt:search-page:<token>:<page>` — see MarketplaceComponentHandler and SearchCriteriaStore. */
export const SEARCH_PAGE_ACTION = 'search-page';

const STATE_LABELS: Record<string, string> = {
    new: '🆕 Novo',
    like_new: '✨ Como novo',
    used_good: '👍 Usado - Bom estado',
    used_marks: '📝 Usado - Com marcas',
    broken: '🔧 Avariado',
};

const STATUS_LABELS: Record<string, string> = {
    active: '🟢 Activo',
    pending_renewal: '🟡 Pendente de renovação',
    sold: '💰 Vendido',
    expired: '⚪ Expirado',
    deleted: '🗑️ Apagado',
};

function describeState(state: string): string {
    return STATE_LABELS[state] ?? `ℹ️ ${state}`;
}

function describeStatus(status: string): string {
    return STATUS_LABELS[status] ?? `ℹ️ ${status}`;
}

function describeType(adType: string | null): string {
    return adType === 'wanted' ? '🔍 Procura-se' : '🏷️ Venda';
}

export interface AdListEmbedOptions {
    title: string;
    /** Shown above the field list, e.g. a result count. */
    description: string;
    adPage: AdPage;
    /** Needed to build `https://discord.com/channels/...` links — `null` degrades every ad to "sem link" (e.g. a DM-context edge case). */
    guildId: string | null;
    /** Adds a "Vendedor: <@id>" line to each field — on for `search` (mixed authors), off for `list` (title already says whose ads these are). */
    showOwner?: boolean;
}

/**
 * Shared by `/marketplace list` (M5.8) and `/marketplace search` (M5.9) —
 * both are "an ephemeral, paginated, status-aware page of ads with working
 * links", differing only in whose ads and which filters. One renderer means
 * the two can never drift into showing status/links differently, the same
 * reasoning `AdListingRenderer.renderAdListing()` already applies to the
 * posted listing itself.
 *
 * Deliberately at most `AdPage.pageSize` fields per call (10 by default —
 * see `ListUserAdsPage`/`SearchAds`), always far under Discord's 25-field
 * cap, so `capFields` here is a defensive backstop against a pathological
 * name/description, not the pagination mechanism itself.
 */
export class AdListPresenter {
    public buildAdListEmbed(options: AdListEmbedOptions): EmbedBuilder {
        const { title, description, adPage, guildId, showOwner } = options;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        const startIndex = (adPage.page - 1) * adPage.pageSize;
        const { fields } = capFields(
            adPage.data,
            (ad: Ad, index: number) => ({
                name: `${startIndex + index + 1}. ${ad.name ?? 'Sem nome'}`,
                value: this.buildFieldValue(ad, guildId, showOwner ?? false),
            }),
            title.length + description.length,
            adPage.pageSize,
        );
        embed.addFields(fields);

        embed.setFooter({
            text: `Página ${adPage.page} de ${adPage.totalPages} • ${adPage.totalCount} anúncio${adPage.totalCount === 1 ? '' : 's'}`,
        });

        return embed;
    }

    private buildFieldValue(ad: Ad, guildId: string | null, showOwner: boolean): string {
        const link =
            guildId && ad.channelId && ad.messageId
                ? `[Ver anúncio](https://discord.com/channels/${guildId}/${ad.channelId}/${ad.messageId})`
                : '🔗 Sem publicação associada';

        return truncateFieldValue(
            [
                describeType(ad.adType),
                describeStatus(ad.status.toString()),
                ad.state ? describeState(ad.state) : null,
                ad.price ? `💰 Preço: ${ad.price}` : null,
                ad.zone ? `📍 Zona: ${ad.zone}` : null,
                showOwner && ad.authorId ? `Vendedor: <@${ad.authorId}>` : null,
                ad.description ? `📝 ${ad.description}` : null,
                `🆔 ${ad.id.toString()}`,
                link,
            ]
                .filter((line): line is string => line !== null)
                .join('\n'),
        );
    }

    /** Always returned, even for one page (both buttons disabled) — same convention as trophies' `buildPaginationRow`. */
    public buildListPaginationRow(
        targetUserId: string,
        adPage: AdPage,
    ): ActionRowBuilder<ButtonBuilder> {
        return this.buildRow(adPage, (page) =>
            buildCustomId(
                'mkt',
                LIST_PAGE_ACTION,
                targetUserId,
                String(page),
                String(adPage.pageSize),
            ),
        );
    }

    /** `token` comes from `SearchCriteriaStore.put()` — see that class for why search pagination can't carry its own state like `list` does. */
    public buildSearchPaginationRow(
        token: string,
        adPage: AdPage,
    ): ActionRowBuilder<ButtonBuilder> {
        return this.buildRow(adPage, (page) =>
            buildCustomId('mkt', SEARCH_PAGE_ACTION, token, String(page)),
        );
    }

    private buildRow(
        adPage: AdPage,
        customIdFor: (page: number) => string,
    ): ActionRowBuilder<ButtonBuilder> {
        const prevPage = Math.max(1, adPage.page - 1);
        const nextPage = Math.min(adPage.totalPages, adPage.page + 1);

        const previousButton = new ButtonBuilder()
            .setCustomId(customIdFor(prevPage))
            .setLabel('◀ Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(adPage.page <= 1);

        const nextButton = new ButtonBuilder()
            .setCustomId(customIdFor(nextPage))
            .setLabel('Próxima ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(adPage.page >= adPage.totalPages);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton);
    }
}
