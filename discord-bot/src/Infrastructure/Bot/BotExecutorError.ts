import type { SlashCommandContext } from '../../Domain/Bot/SlashCommandContext';
import type { MentionContext } from '../../Domain/Bot/MentionContext.ts';
import type {
    ComponentInteractionContext,
    ModalInteractionContext,
} from '../../Domain/Bot/InteractionContext.ts';

type ErrorContext =
    MentionContext | SlashCommandContext | ComponentInteractionContext | ModalInteractionContext;

export class BotExecutorError extends Error {
    private constructor(
        message: string,
        public readonly context?: ErrorContext,
    ) {
        super(message);
    }

    public static createForMention(error: string, context: MentionContext): BotExecutorError {
        return new BotExecutorError(`Error executing mention: ${error}`, context);
    }

    public static createForSlashCommand(
        error: string,
        context: SlashCommandContext,
    ): BotExecutorError {
        return new BotExecutorError(
            `Error executing slash command ${context.command}: ${error}`,
            context,
        );
    }

    public static createForComponent(
        error: string,
        context: ComponentInteractionContext | ModalInteractionContext,
    ): BotExecutorError {
        return new BotExecutorError(
            `Error executing component ${context.interaction.customId}: ${error}`,
            context,
        );
    }
}
