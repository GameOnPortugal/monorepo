import { describe, expect, it } from 'bun:test';
import { BotExecutor } from '../../../../src/Infrastructure/Bot/BotExecutor';
import { BotExecutorError } from '../../../../src/Infrastructure/Bot/BotExecutorError';
import Logger from '../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../Helper/InMemoryLogger';
import FakeComponentInteraction from '../../../Helper/FakeComponentInteraction';
import FakeAutocompleteInteraction from '../../../Helper/FakeAutocompleteInteraction';
import type { ComponentHandler } from '../../../../src/Domain/Bot/ComponentHandler';
import type { AutocompleteHandler } from '../../../../src/Domain/Bot/AutocompleteHandler';
import type {
    AutocompleteInteractionContext,
    ComponentInteractionContext,
    ModalInteractionContext,
} from '../../../../src/Domain/Bot/InteractionContext';

class RecordingComponentHandler implements ComponentHandler {
    public readonly seen: string[] = [];

    constructor(private readonly namespace: string) {}

    getNamespace(): string {
        return this.namespace;
    }

    async handle(context: ComponentInteractionContext | ModalInteractionContext): Promise<void> {
        this.seen.push(context.interaction.customId);
    }
}

function buildExecutor(
    componentHandlers: ComponentHandler[] = [],
    autocompleteHandlers: AutocompleteHandler[] = [],
): { executor: BotExecutor; logs: InMemoryLogger } {
    const logs = new InMemoryLogger();
    const executor = new BotExecutor(
        [],
        [],
        new Logger([logs]),
        componentHandlers,
        autocompleteHandlers,
    );
    return { executor, logs };
}

function componentContext(customId: string): ComponentInteractionContext {
    const interaction = new FakeComponentInteraction(customId);
    return { kind: 'component', interaction: interaction.asButtonInteraction() };
}

describe('BotExecutor component routing (M4.7)', () => {
    it('routes a button to the handler owning its custom ID namespace', async () => {
        const marketplace = new RecordingComponentHandler('mkt');
        const trophies = new RecordingComponentHandler('trophies');
        const { executor } = buildExecutor([marketplace, trophies]);

        const handled = await executor.executeComponent(componentContext('mkt:sold:abc'));

        expect(handled).toBe(true);
        expect(marketplace.seen).toEqual(['mkt:sold:abc']);
        expect(trophies.seen).toEqual([]);
    });

    it('reports an unknown namespace as unhandled rather than throwing', async () => {
        // A message posted by an older version of the bot is still clickable
        // after the feature behind it is gone. That is an expected state, not
        // a wiring bug — unlike an unhandled *slash command*, which is.
        const { executor, logs } = buildExecutor([new RecordingComponentHandler('mkt')]);

        const handled = await executor.executeComponent(componentContext('gone:action:1'));

        expect(handled).toBe(false);
        expect(logs.hasLog('warn', 'No component handler found for custom ID namespace')).toBe(
            true,
        );
    });

    it('reports an unparseable custom ID as unhandled', async () => {
        const { executor, logs } = buildExecutor([new RecordingComponentHandler('mkt')]);

        const handled = await executor.executeComponent(componentContext('not-our-format'));

        expect(handled).toBe(false);
        expect(logs.hasLog('warn', 'Component interaction with an unparseable custom ID')).toBe(
            true,
        );
    });

    it('refuses to guess when two handlers claim the same namespace', async () => {
        // Picking the first would make routing depend on import order in
        // inversify.config.ts, which is not a property anyone should have to
        // reason about when adding a binding.
        const { executor } = buildExecutor([
            new RecordingComponentHandler('mkt'),
            new RecordingComponentHandler('mkt'),
        ]);

        await expect(executor.executeComponent(componentContext('mkt:sold:abc'))).rejects.toThrow(
            BotExecutorError,
        );
    });

    it('routes a modal submission through the same namespace table', async () => {
        const marketplace = new RecordingComponentHandler('mkt');
        const { executor } = buildExecutor([marketplace]);
        const interaction = new FakeComponentInteraction('mkt:edit-submit:abc');

        const handled = await executor.executeComponent({
            kind: 'modal',
            interaction: interaction as unknown as ModalInteractionContext['interaction'],
        });

        expect(handled).toBe(true);
        expect(marketplace.seen).toEqual(['mkt:edit-submit:abc']);
    });
});

describe('BotExecutor autocomplete routing (M4.8)', () => {
    function autocompleteContext(commandName: string): {
        context: AutocompleteInteractionContext;
        fake: FakeAutocompleteInteraction;
    } {
        const fake = new FakeAutocompleteInteraction(commandName, { name: 'id', value: '' });
        return {
            context: { kind: 'autocomplete', interaction: fake.asAutocompleteInteraction() },
            fake,
        };
    }

    class StubAutocompleteHandler implements AutocompleteHandler {
        constructor(
            private readonly name: string,
            private readonly behaviour: (context: AutocompleteInteractionContext) => Promise<void>,
        ) {}

        getName(): string {
            return this.name;
        }

        handle(context: AutocompleteInteractionContext): Promise<void> {
            return this.behaviour(context);
        }
    }

    it('routes to the handler matching the command name', async () => {
        const handler = new StubAutocompleteHandler('marketplace', async (context) => {
            await context.interaction.respond([{ name: 'An ad', value: 'ad-1' }]);
        });
        const { executor } = buildExecutor([], [handler]);
        const { context, fake } = autocompleteContext('marketplace');

        await executor.executeAutocomplete(context);

        expect(fake.choices).toEqual([{ name: 'An ad', value: 'ad-1' }]);
    });

    it('answers with an empty list when no handler matches, never leaving it unanswered', async () => {
        // An unanswered autocomplete is what produces "This application did
        // not respond" while a member is mid-type.
        const { executor, logs } = buildExecutor([], []);
        const { context, fake } = autocompleteContext('marketplace');

        await executor.executeAutocomplete(context);

        expect(fake.choices).toEqual([]);
        expect(logs.hasLog('warn', 'No autocomplete handler found')).toBe(true);
    });

    it('answers with an empty list when the handler throws', async () => {
        const handler = new StubAutocompleteHandler('marketplace', async () => {
            throw new Error('database is down');
        });
        const { executor, logs } = buildExecutor([], [handler]);
        const { context, fake } = autocompleteContext('marketplace');

        await executor.executeAutocomplete(context);

        expect(fake.choices).toEqual([]);
        expect(logs.hasLog('error', 'Autocomplete handler failed')).toBe(true);
    });

    it('does not answer twice when the handler answered before throwing', async () => {
        // respond() throws on a second call; the fallback must notice the
        // interaction is already answered rather than turning a partial
        // success into a logged failure.
        const handler = new StubAutocompleteHandler('marketplace', async (context) => {
            await context.interaction.respond([{ name: 'An ad', value: 'ad-1' }]);
            throw new Error('something after the respond');
        });
        const { executor, logs } = buildExecutor([], [handler]);
        const { context, fake } = autocompleteContext('marketplace');

        await executor.executeAutocomplete(context);

        expect(fake.respondCalls.length).toBe(1);
        expect(logs.hasLog('warn', 'Failed to send empty autocomplete response')).toBe(false);
    });

    it('gives up on a handler that overruns its budget instead of holding the interaction', async () => {
        const handler = new StubAutocompleteHandler(
            'marketplace',
            () => new Promise<void>(() => {}),
        );
        const { executor, logs } = buildExecutor([], [handler]);
        const { context, fake } = autocompleteContext('marketplace');

        await executor.executeAutocomplete(context);

        expect(fake.choices).toEqual([]);
        expect(logs.hasLog('error', 'Autocomplete handler failed')).toBe(true);
    }, 10_000);
});
