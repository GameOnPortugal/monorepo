import {inject, injectable} from "inversify";
import type {SlashCommandHandler} from "../../../../Domain/Bot/SlashCommandHandler.ts";
import type {SlashCommandContext} from "../../../../Domain/Bot/SlashCommandContext.ts";
import CommandHandlerManager from "../../../CommandHandler/CommandHandlerManager.ts";
import {Ping} from "../../../../Application/Query/Ping/Ping.ts";
import {SlashCommandBuilder} from "discord.js";

@injectable()
export class PingSlashCommand implements SlashCommandHandler {

    constructor(
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
    ) {
    }

    public getName(): string {
        return "ping";
    }

    public builder(): any {
        return new SlashCommandBuilder()
            .setName('ping')
            .setDescription("Replies with a pong!")
    }

    async handle(context: SlashCommandContext): Promise<void> {
        await this.commandHandlerManager.handle(new Ping());

        await context.interaction.reply('pong! 🏓');
    }
}