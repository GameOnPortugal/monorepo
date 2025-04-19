import {inject, injectable, multiInject} from "inversify";
import type {SlashCommandHandler} from "../../Domain/Bot/SlashCommandHandler";
import type {SlashCommandContext} from "../../Domain/Bot/SlashCommandContext";
import Logger from "../../Application/Logger/Logger";
import {TYPES} from "../DependencyInjection/types.ts";
import {BotExecutorError} from "./BotExecutorError.ts";
import type {MentionContext} from "../../Domain/Bot/MentionContext.ts";
import type {MentionHandler} from "../../Domain/Bot/MentionHandler.ts";

@injectable()
export class BotExecutor {

    constructor(
        @multiInject(TYPES.SlashCommandHandler) public readonly slashCommandHandlers: SlashCommandHandler[],
        @multiInject(TYPES.MentionHandler) public readonly mentionHandlers: MentionHandler[],
        @inject(TYPES.Logger) private readonly logger: Logger
    ) {
    }

    public getCommandNames(): string[] {
        return this.slashCommandHandlers.map(handler => handler.getName());
    }

    public async execute(context: MentionContext|SlashCommandContext): Promise<void> {
        if (isMentionContext(context)) {
            await this.executeMention(context);
            return;
        }

        await this.executeSlashCommand(context);
    }

    private async executeMention(context: MentionContext): Promise<void> {
        for (const handler of this.mentionHandlers) {
            if (handler.supports(context)) {
                this.logger.info('Mention handler found', {
                    handler: handler.constructor.name,
                    text: context.event.text.trim()
                });

                await handler.handle(context); return;
            }
        }

        throw BotExecutorError.createForMention('No mention handler found', context);
    }

    private async executeSlashCommand(context: SlashCommandContext): Promise<void> {
        for (const handler of this.slashCommandHandlers) {
            if (handler.getName() === context.command) {
                this.logger.info('Slash command handler found', {
                    handler: handler.constructor.name,
                    command: context.command
                });

                await handler.handle(context); return;
            }
        }

        throw BotExecutorError.createForSlashCommand('No handler found', context);
    }
}

function isMentionContext(context: any): context is MentionContext {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- is just to facilitate
    return (context as MentionContext).event !== undefined;
}
