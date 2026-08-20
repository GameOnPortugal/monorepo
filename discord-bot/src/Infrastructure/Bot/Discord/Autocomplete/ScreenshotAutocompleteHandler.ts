import { inject, injectable } from 'inversify';
import { TYPES } from '../../../DependencyInjection/types.ts';
import type Logger from '../../../../Application/Logger/Logger.ts';
import CommandHandlerManager from '../../../CommandHandler/CommandHandlerManager.ts';
import { GetScreenshots } from '../../../../Application/Query/Screenshot/GetScreenshots/GetScreenshots.ts';
import type { Screenshot } from '../../../../Domain/Screenshot/Screenshot.ts';
import { toChoices, type AutocompleteHandler } from '../../../../Domain/Bot/AutocompleteHandler.ts';
import type { AutocompleteInteractionContext } from '../../../../Domain/Bot/InteractionContext.ts';

/**
 * Suggests the invoking member's own screenshots for `/screenshot delete id`
 * (M4.8) — the same fix as {@link MarketplaceAutocompleteHandler}, for the
 * other command that asked a member to paste a UUID.
 *
 * `/screenshot delete` also accepted a leading `#` (the form the id is
 * displayed in), stripped by the subcommand. Autocomplete sends the bare id
 * as the value, so that path stops being reached in practice — but it is left
 * in place, because the option is still free text for anyone who types past
 * the suggestions.
 *
 * As with ads, scoping to `interaction.user.id` here is convenience;
 * `DeleteScreenshotHandler`'s `NotAuthorized` check is the boundary.
 */
@injectable()
export class ScreenshotAutocompleteHandler implements AutocompleteHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'screenshot';
    }

    public async handle(context: AutocompleteInteractionContext): Promise<void> {
        const { interaction } = context;
        const focused = interaction.options.getFocused(true);

        if (focused.name !== 'id') {
            await interaction.respond([]);
            return;
        }

        const screenshots: Screenshot[] = await this.commandHandlerManager.handle(
            new GetScreenshots(interaction.user.id),
        );

        const query = focused.value.trim().replace(/^#/, '').toLowerCase();
        const matches = screenshots.filter(
            (screenshot) => query === '' || describe(screenshot).toLowerCase().includes(query),
        );

        this.logger.info('Screenshot autocomplete', {
            userId: interaction.user.id,
            total: screenshots.length,
            matched: matches.length,
        });

        await interaction.respond(
            toChoices(
                matches.map((screenshot) => ({
                    name: describe(screenshot),
                    value: screenshot.id.toString(),
                })),
            ),
        );
    }
}

function describe(screenshot: Screenshot): string {
    const parts = [screenshot.name ?? 'Sem nome'];
    if (screenshot.platform) {
        parts.push(`[${screenshot.platform}]`);
    }
    parts.push(formatDate(screenshot.createdAt));
    return parts.join(' ');
}

/** `DD-MM-YYYY`, the date format the rest of the bot's Portuguese copy uses. */
function formatDate(date: Date): string {
    const pad = (value: number): string => value.toString().padStart(2, '0');
    return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}
