import { inject, injectable, multiInject, optional } from 'inversify';
import type { SlashCommandHandler } from '../../Domain/Bot/SlashCommandHandler';
import type { SlashCommandContext } from '../../Domain/Bot/SlashCommandContext';
import Logger from '../../Application/Logger/Logger';
import { TYPES } from '../DependencyInjection/types.ts';
import { BotExecutorError } from './BotExecutorError.ts';
import type { MentionContext } from '../../Domain/Bot/MentionContext.ts';
import type { MentionHandler } from '../../Domain/Bot/MentionHandler.ts';
import type { ComponentHandler } from '../../Domain/Bot/ComponentHandler.ts';
import type { AutocompleteHandler } from '../../Domain/Bot/AutocompleteHandler.ts';
import type {
    AutocompleteInteractionContext,
    ComponentInteractionContext,
    ModalInteractionContext,
} from '../../Domain/Bot/InteractionContext.ts';
import { parseCustomId } from '../../Domain/Bot/CustomId.ts';

/**
 * How long an autocomplete handler gets before the executor gives up and
 * answers with an empty list.
 *
 * Discord's interaction acknowledgement deadline is 3 seconds and
 * autocomplete — unlike every other interaction type — has no `deferReply()`
 * escape hatch. Racing the handler against a budget comfortably inside that
 * deadline means a slow query degrades to "no suggestions", which is what the
 * member already sees while typing, instead of an unacknowledged interaction
 * and a red "This application did not respond" in the channel.
 */
const AUTOCOMPLETE_BUDGET_MS = 2_000;

@injectable()
export class BotExecutor {
    constructor(
        @multiInject(TYPES.SlashCommandHandler)
        public readonly slashCommandHandlers: SlashCommandHandler[],
        @multiInject(TYPES.MentionHandler) public readonly mentionHandlers: MentionHandler[],
        @inject(TYPES.Logger) private readonly logger: Logger,
        // `@optional()` on both: inversify throws on a @multiInject of a
        // symbol with zero bindings, and a deployment that has registered no
        // component or autocomplete handlers at all is a legitimate state
        // (it is what `main` looked like before M4.7). Defaulting to `[]`
        // keeps that from being a container-construction crash at boot.
        @multiInject(TYPES.ComponentHandler)
        @optional()
        public readonly componentHandlers: ComponentHandler[] = [],
        @multiInject(TYPES.AutocompleteHandler)
        @optional()
        public readonly autocompleteHandlers: AutocompleteHandler[] = [],
    ) {}

    public getCommandNames(): string[] {
        return this.slashCommandHandlers.map((handler) => handler.getName());
    }

    public async execute(context: MentionContext | SlashCommandContext): Promise<void> {
        if (isMentionContext(context)) {
            await this.executeMention(context);
            return;
        }

        await this.executeSlashCommand(context);
    }

    /**
     * Routes a button click, select-menu choice or modal submission to the
     * handler owning its custom ID namespace (M4.7).
     *
     * Unknown namespaces are *not* an error. Components outlive the code that
     * created them — a message posted by v1.2 is still clickable after v1.3
     * has removed the feature — so "nothing here handles this" is an expected
     * outcome that deserves a warning and a polite reply to the member, not
     * the `BotExecutorError` a missing slash-command handler raises (a slash
     * command that reaches the executor unhandled means registration and
     * bindings disagree, which is genuinely a bug).
     */
    public async executeComponent(
        context: ComponentInteractionContext | ModalInteractionContext,
    ): Promise<boolean> {
        const { interaction } = context;
        const parsed = parseCustomId(interaction.customId);

        if (!parsed) {
            this.logger.warn('Component interaction with an unparseable custom ID', {
                customId: interaction.customId,
                userId: interaction.user.id,
            });
            return false;
        }

        const matches = this.componentHandlers.filter(
            (handler) => handler.getNamespace() === parsed.namespace,
        );

        if (matches.length > 1) {
            // Ambiguous routing is a wiring bug, and picking the first
            // binding would make it depend on import order in
            // inversify.config.ts. Refuse instead of guessing.
            throw BotExecutorError.createForComponent(
                `${matches.length} handlers claim the custom ID namespace "${parsed.namespace}" ` +
                    `(${matches.map((handler) => handler.constructor.name).join(', ')})`,
                context,
            );
        }

        const handler = matches[0];
        if (!handler) {
            this.logger.warn('No component handler found for custom ID namespace', {
                customId: interaction.customId,
                namespace: parsed.namespace,
                userId: interaction.user.id,
            });
            return false;
        }

        this.logger.info('Component handler found', {
            handler: handler.constructor.name,
            customId: interaction.customId,
            action: parsed.action,
            userId: interaction.user.id,
        });

        await handler.handle(context);
        return true;
    }

    /**
     * Answers an autocomplete interaction (M4.8), always — with the handler's
     * choices, or with an empty list if there is no handler, the handler
     * throws, or it overruns {@link AUTOCOMPLETE_BUDGET_MS}. A member typing
     * into an option must never be shown "This application did not respond"
     * because a suggestion list failed to build.
     */
    public async executeAutocomplete(context: AutocompleteInteractionContext): Promise<void> {
        const { interaction } = context;
        const handler = this.autocompleteHandlers.find(
            (candidate) => candidate.getName() === interaction.commandName,
        );

        if (!handler) {
            this.logger.warn('No autocomplete handler found', {
                command: interaction.commandName,
            });
            await this.respondEmpty(context);
            return;
        }

        try {
            await Promise.race([
                handler.handle(context),
                new Promise<never>((_resolve, reject) =>
                    setTimeout(
                        () => reject(new Error('Autocomplete handler timed out')),
                        AUTOCOMPLETE_BUDGET_MS,
                    ).unref?.(),
                ),
            ]);
        } catch (error) {
            this.logger.error('Autocomplete handler failed', {
                handler: handler.constructor.name,
                command: interaction.commandName,
                error,
            });
            await this.respondEmpty(context);
        }
    }

    /**
     * `respond()` throws if the interaction was already answered — which is
     * exactly the case when a handler answered and *then* timed out on
     * something after it, or when it answered before throwing. Swallowing
     * that keeps the fallback from turning a partial success into a logged
     * error.
     */
    private async respondEmpty(context: AutocompleteInteractionContext): Promise<void> {
        if (context.interaction.responded) {
            return;
        }

        try {
            await context.interaction.respond([]);
        } catch (error) {
            this.logger.warn('Failed to send empty autocomplete response', { error });
        }
    }

    private async executeMention(context: MentionContext): Promise<void> {
        for (const handler of this.mentionHandlers) {
            if (handler.supports(context)) {
                this.logger.info('Mention handler found', {
                    handler: handler.constructor.name,
                    text: context.event.text.trim(),
                });

                await handler.handle(context);
                return;
            }
        }

        throw BotExecutorError.createForMention('No mention handler found', context);
    }

    private async executeSlashCommand(context: SlashCommandContext): Promise<void> {
        for (const handler of this.slashCommandHandlers) {
            if (handler.getName() === context.command) {
                this.logger.info('Slash command handler found', {
                    handler: handler.constructor.name,
                    command: context.command,
                });

                await handler.handle(context);
                return;
            }
        }

        throw BotExecutorError.createForSlashCommand('No handler found', context);
    }
}

function isMentionContext(
    context: MentionContext | SlashCommandContext,
): context is MentionContext {
    return (context as MentionContext).event !== undefined;
}
