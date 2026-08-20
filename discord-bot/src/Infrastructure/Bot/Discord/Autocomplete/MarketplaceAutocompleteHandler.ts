import { inject, injectable } from 'inversify';
import { TYPES } from '../../../DependencyInjection/types.ts';
import type Logger from '../../../../Application/Logger/Logger.ts';
import CommandHandlerManager from '../../../CommandHandler/CommandHandlerManager.ts';
import { ListUserAds } from '../../../../Application/Query/Marketplace/ListUserAds/ListUserAds.ts';
import type { Ad } from '../../../../Domain/Marketplace/Ad.ts';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus.ts';
import { toChoices, type AutocompleteHandler } from '../../../../Domain/Bot/AutocompleteHandler.ts';
import type { AutocompleteInteractionContext } from '../../../../Domain/Bot/InteractionContext.ts';

/**
 * Suggests the invoking member's own ads for `/marketplace delete id` (M4.8).
 *
 * This replaces asking a member to paste a UUID — which nothing in Discord
 * ever showed them in a copyable form — and the `/^\d+$/` "or type a position
 * number" fallback that grew around it. That fallback was not just awkward,
 * it was a race: the position came from a *second* `ListUserAds` query run at
 * delete time, so an ad created (or expired) between reading the list and
 * typing the number silently shifted every position after it, and "2" deleted
 * a different ad than the one the member had read. Autocomplete sends the id
 * itself as the option value, so there is no index to go stale.
 *
 * The list is scoped to `interaction.user.id` at the query, so a member is
 * only ever offered their own rows. That is a convenience, not the security
 * boundary: `DeleteAdHandler` still re-checks ownership, because the option
 * value is free text that a client can send without ever opening the
 * suggestion list.
 */
@injectable()
export class MarketplaceAutocompleteHandler implements AutocompleteHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'marketplace';
    }

    public async handle(context: AutocompleteInteractionContext): Promise<void> {
        const { interaction } = context;
        const focused = interaction.options.getFocused(true);

        if (focused.name !== 'id') {
            await interaction.respond([]);
            return;
        }

        const ads: Ad[] = await this.commandHandlerManager.handle(
            new ListUserAds(interaction.user.id),
        );

        const query = focused.value.trim().toLowerCase();
        const matches = ads
            .filter((ad) => !ad.status.equals(AdStatus.deleted()))
            .filter((ad) => query === '' || describeAd(ad).toLowerCase().includes(query));

        this.logger.info('Marketplace autocomplete', {
            userId: interaction.user.id,
            total: ads.length,
            matched: matches.length,
        });

        await interaction.respond(
            toChoices(
                matches.map((ad) => ({
                    name: describeAd(ad),
                    value: ad.id.toString(),
                })),
            ),
        );
    }
}

/**
 * What the member reads in the dropdown. The id is deliberately *not* in the
 * label: it is the option's value, so Discord fills it in on selection, and
 * 36 characters of UUID would crowd out the item name inside the 100-character
 * label budget that `toChoices` enforces.
 */
function describeAd(ad: Ad): string {
    const parts = [ad.name ?? 'Sem nome'];
    if (ad.price) {
        parts.push(`— ${ad.price}`);
    }
    parts.push(`(${ad.status.toString()})`);
    return parts.join(' ');
}
