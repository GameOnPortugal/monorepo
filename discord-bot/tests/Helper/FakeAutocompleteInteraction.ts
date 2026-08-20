import type { AutocompleteInteraction } from 'discord.js';

/**
 * The subset of `AutocompleteInteraction` the M4.8 handlers touch, in the
 * same hand-rolled style as {@link FakeInteraction} (no mocking library —
 * see AGENT.md).
 *
 * The distinguishing property of autocomplete is that it is answered with
 * `respond()` and nothing else: no reply, no defer, and calling `respond()`
 * twice throws. `responded` and the throw are both modelled here, because
 * "the executor answered a second time after the handler already had" is
 * exactly the bug the fallback path in `BotExecutor.respondEmpty()` exists to
 * avoid.
 */
export default class FakeAutocompleteInteraction {
    public responded = false;
    public readonly respondCalls: Array<Array<{ name: string; value: string }>> = [];

    public readonly user: { id: string; username: string };
    public readonly commandName: string;
    public readonly options: {
        getFocused: (getFull: true) => { name: string; value: string };
        getSubcommand: () => string;
    };

    constructor(
        commandName: string,
        focused: { name: string; value: string },
        userId = '111111111111111111',
        subcommand = 'delete',
        username = 'test-user',
    ) {
        this.commandName = commandName;
        this.user = { id: userId, username };
        this.options = {
            getFocused: () => focused,
            getSubcommand: () => subcommand,
        };
    }

    async respond(choices: Array<{ name: string; value: string }>): Promise<void> {
        if (this.responded) {
            throw new Error('FakeAutocompleteInteraction: already responded');
        }
        this.responded = true;
        this.respondCalls.push(choices);
    }

    /** The choices sent by the single `respond()` call, or `undefined`. */
    get choices(): Array<{ name: string; value: string }> | undefined {
        return this.respondCalls[0];
    }

    asAutocompleteInteraction(): AutocompleteInteraction {
        return this as unknown as AutocompleteInteraction;
    }
}
