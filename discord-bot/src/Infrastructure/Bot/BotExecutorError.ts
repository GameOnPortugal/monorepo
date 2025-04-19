import type {SlashCommandContext} from "../../Domain/Bot/SlashCommandContext";
import type {MentionContext} from "../../Domain/Bot/MentionContext.ts";

export class BotExecutorError extends Error {
    private constructor(message: string, public readonly context?: MentionContext|SlashCommandContext) {
        super(message);
    }

    public static createForMention(error: string, context: MentionContext): BotExecutorError {
        return new BotExecutorError(`Error executing mention: ${error}`, context);
    }

    public static createForSlashCommand(error: string, context: SlashCommandContext): BotExecutorError {
        return new BotExecutorError(`Error executing slash command ${context.command}: ${error}`, context);
    }
}