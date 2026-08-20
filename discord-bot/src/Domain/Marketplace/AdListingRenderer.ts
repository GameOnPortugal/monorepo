import type { Ad } from './Ad';
import type { MessageButton, RichMessageContent } from '../Community/GuildClient';
import { buildCustomId } from '../Bot/CustomId';

/**
 * The posted listing (M5.5): an `EmbedBuilder`-shaped, pt-PT, colour-coded
 * message with the ad's id in the footer (so a row is recoverable from the
 * message alone, the way screenshots already are) and the three action
 * buttons (`💬 Contactar` / `✅ Marcar vendido` / `🔄 Renovar`).
 *
 * Pure and discord.js-free — it returns a `RichMessageContent`
 * (`Domain/Community/GuildClient.ts`), not a discord.js `EmbedBuilder`, so
 * it lives in `Domain/Marketplace` rather than `Infrastructure/Bot`.
 * `DiscordGuildClient` is the only place that turns this into real API
 * objects. Every caller that posts or reposts a listing — `SellSubcommand`
 * (create), the `mkt` component handler (bump/renew) and `EditAd` (re-render
 * in place) — goes through this one function, so the embed shape can never
 * drift between them.
 *
 * Colour-coded by `adType` (mint `#8AFBCC` for `sell`, blue `#4199E7` for
 * `wanted`) deliberately, not just for `sell`: M5.7's `wanted` subcommand
 * has nothing to build here beyond calling this with a `wanted` ad.
 */
const SELL_COLOR = 0x8afbcc;
const WANTED_COLOR = 0x4199e7;

const STATE_LABELS: Record<string, string> = {
    new: '🆕 Novo',
    like_new: '✨ Como novo',
    used_good: '👍 Usado - Bom estado',
    used_marks: '📝 Usado - Com marcas',
    broken: '🔧 Avariado',
};

const DISPATCH_LABELS: Record<string, string> = {
    included: '🚚 Envio incluído',
    not_included: '🚚 Envio não incluído',
    face_to_face: '🤝 Entrega em mão',
};

function describeState(state: string | null): string | null {
    if (!state) {
        return null;
    }
    return STATE_LABELS[state] ?? `ℹ️ ${state}`;
}

function describeDispatch(dispatch: string | null): string | null {
    if (!dispatch) {
        return null;
    }
    return DISPATCH_LABELS[dispatch] ?? `🚚 ${dispatch}`;
}

/**
 * Options only the caller — not the `Ad` row — knows. `authorDisplayName`
 * because embed `author.name`/`footer.text` are plain text, never
 * mention-parsed by Discord's client (unlike embed *description*, which is)
 * — so a bare `authorId` there would render as literal, unclickable text
 * `<@...>` rather than a name. Infrastructure resolves the real Discord
 * username (from the interaction that triggered the render) and passes it
 * in; a missing one degrades to the raw id rather than failing the render.
 */
export interface AdListingRenderOptions {
    authorDisplayName?: string;
    authorIconUrl?: string;
}

export function renderAdListing(ad: Ad, options: AdListingRenderOptions = {}): RichMessageContent {
    const isWanted = ad.adType === 'wanted';

    const descriptionLines = [
        describeState(ad.state),
        ad.price ? `💰 Preço: ${ad.price}` : null,
        ad.zone ? `📍 Zona: ${ad.zone}` : null,
        describeDispatch(ad.dispatch),
        ad.warranty ? `⚡ Garantia: ${ad.warranty}` : null,
        ad.description ? `📝 ${ad.description}` : null,
        '',
        ad.authorId ? `Publicado por: <@${ad.authorId}>` : null,
    ].filter((line): line is string => line !== null);

    const buttons: MessageButton[] = [
        {
            customId: buildCustomId('mkt', 'contact', ad.id.toString()),
            label: 'Contactar',
            emoji: '💬',
            style: 'secondary',
        },
        {
            customId: buildCustomId('mkt', 'sold', ad.id.toString()),
            label: 'Marcar vendido',
            emoji: '✅',
            style: 'success',
        },
        {
            customId: buildCustomId('mkt', 'bump', ad.id.toString()),
            label: 'Renovar',
            emoji: '🔄',
            style: 'primary',
        },
    ];

    return {
        color: isWanted ? WANTED_COLOR : SELL_COLOR,
        title: isWanted ? `🔍 Procura-se: ${ad.name ?? 'Item'}` : `🏷️ ${ad.name ?? 'Item'}`,
        description: descriptionLines.join('\n'),
        imageUrl: ad.images[0],
        authorName: options.authorDisplayName ?? ad.authorId ?? undefined,
        authorIconUrl: options.authorIconUrl,
        footerText: `ID do anúncio: ${ad.id.toString()}`,
        buttons,
    };
}
