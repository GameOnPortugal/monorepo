import type { AutocompleteInteractionContext } from './InteractionContext';

/** Discord accepts at most 25 autocomplete choices per response. */
export const AUTOCOMPLETE_MAX_CHOICES = 25;

/** Discord truncates an autocomplete choice `name` beyond 100 characters. */
export const AUTOCOMPLETE_MAX_NAME_LENGTH = 100;

/**
 * Supplies the choice list for a focused autocomplete option (M4.8).
 *
 * One handler per top-level slash command, matched by `getName()` exactly as
 * `SlashCommandHandler` is — the autocomplete interaction carries the same
 * `commandName`, and the handler reads `getSubcommand()` / `getFocused()` to
 * decide which option it is completing.
 *
 * **Autocomplete cannot be deferred.** There is no `deferReply()` for it: the
 * response must go out inside the same ~3 second window, or the user sees
 * nothing at all. Anything a handler does here must therefore be one cheap
 * indexed query — never an HTTP call, never a full-table scan. `BotExecutor`
 * enforces a timeout and answers empty rather than letting a slow handler
 * hold the interaction open to no purpose.
 */
export interface AutocompleteHandler {
    /** The top-level slash command name, e.g. `marketplace`. */
    getName: () => string;

    handle: (context: AutocompleteInteractionContext) => Promise<void>;
}

/**
 * Clamps a choice list to what Discord will accept: at most 25 entries, each
 * with a name of at most 100 characters. Sending more is a 400 from the API,
 * which surfaces to the member as an autocomplete box that simply never
 * populates — so this is applied centrally rather than trusted to each
 * handler.
 */
export function toChoices(
    entries: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
    return entries.slice(0, AUTOCOMPLETE_MAX_CHOICES).map((entry) => ({
        name:
            entry.name.length > AUTOCOMPLETE_MAX_NAME_LENGTH
                ? `${entry.name.slice(0, AUTOCOMPLETE_MAX_NAME_LENGTH - 1)}…`
                : entry.name,
        value: entry.value,
    }));
}
