import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildCustomId } from '../../../../../Domain/Bot/CustomId';
import type { Ad } from '../../../../../Domain/Marketplace/Ad';
import type { AdPage } from '../../../../../Domain/Marketplace/AdPage';
import { capFields, truncateFieldValue } from '../../../../../Domain/Bot/embedLimits';
import { messages, type BotMessages } from '../../../../../Domain/Bot/I18n/messages';
import type { BotLocale } from '../../../../../Domain/Bot/I18n/BotLocale';

/** `mkt:list-page:<targetUserId>:<page>:<pageSize>` — see MarketplaceComponentHandler. */
export const LIST_PAGE_ACTION = 'list-page';
/** `mkt:search-page:<token>:<page>` — see MarketplaceComponentHandler and SearchCriteriaStore. */
export const SEARCH_PAGE_ACTION = 'search-page';

/**
 * The state/status/type vocabularies live in the message catalogue
 * (`Domain/Bot/I18n/messages.ts`), not here: `/marketplace list` and
 * `/marketplace search` are both ephemeral, so they are rendered in the
 * asking member's own language. The near-identical tables in
 * `Domain/Marketplace/AdListingRenderer.ts` deliberately stay pt-PT-only —
 * that renderer builds the *public* `📖anuncios` post, which has no single
 * member to pick a language for.
 */
function describeState(m: BotMessages['marketplace'], state: string): string {
    return m.stateLabels[state] ?? `ℹ️ ${state}`;
}

function describeStatus(m: BotMessages['marketplace'], status: string): string {
    return m.statusLabels[status] ?? `ℹ️ ${status}`;
}

function describeType(m: BotMessages['marketplace'], adType: string | null): string {
    return adType === 'wanted' ? m.typeWanted : m.typeSell;
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
    /** Which message catalogue to render in — the *asking* member's, since both callers are ephemeral. Defaults to pt-PT. */
    locale?: BotLocale;
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
        const catalogue = messages(options.locale ?? 'pt');
        const m = catalogue.marketplace;

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        const startIndex = (adPage.page - 1) * adPage.pageSize;
        const { fields } = capFields(
            adPage.data,
            (ad: Ad, index: number) => ({
                name: `${startIndex + index + 1}. ${ad.name ?? catalogue.common.unnamed}`,
                value: this.buildFieldValue(m, ad, guildId, showOwner ?? false),
            }),
            title.length + description.length,
            adPage.pageSize,
        );
        embed.addFields(fields);

        embed.setFooter({
            text: m.pageFooter(adPage.page, adPage.totalPages, adPage.totalCount),
        });

        return embed;
    }

    private buildFieldValue(
        m: BotMessages['marketplace'],
        ad: Ad,
        guildId: string | null,
        showOwner: boolean,
    ): string {
        const link =
            guildId && ad.channelId && ad.messageId
                ? `[${m.viewListing}](https://discord.com/channels/${guildId}/${ad.channelId}/${ad.messageId})`
                : m.noLinkedPost;

        return truncateFieldValue(
            [
                describeType(m, ad.adType),
                describeStatus(m, ad.status.toString()),
                ad.state ? describeState(m, ad.state) : null,
                ad.price ? m.priceLine(ad.price) : null,
                ad.zone ? m.zoneLine(ad.zone) : null,
                showOwner && ad.authorId ? m.sellerLine(ad.authorId) : null,
                ad.description ? m.descriptionLine(ad.description) : null,
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
        locale: BotLocale = 'pt',
    ): ActionRowBuilder<ButtonBuilder> {
        return this.buildRow(adPage, locale, (page) =>
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
        locale: BotLocale = 'pt',
    ): ActionRowBuilder<ButtonBuilder> {
        return this.buildRow(adPage, locale, (page) =>
            buildCustomId('mkt', SEARCH_PAGE_ACTION, token, String(page)),
        );
    }

    private buildRow(
        adPage: AdPage,
        locale: BotLocale,
        customIdFor: (page: number) => string,
    ): ActionRowBuilder<ButtonBuilder> {
        const common = messages(locale).common;
        const prevPage = Math.max(1, adPage.page - 1);
        const nextPage = Math.min(adPage.totalPages, adPage.page + 1);

        const previousButton = new ButtonBuilder()
            .setCustomId(customIdFor(prevPage))
            .setLabel(common.previousButton)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(adPage.page <= 1);

        const nextButton = new ButtonBuilder()
            .setCustomId(customIdFor(nextPage))
            .setLabel(common.nextButton)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(adPage.page >= adPage.totalPages);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton);
    }
}
