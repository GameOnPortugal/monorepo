import { inject, injectable } from 'inversify';
import type { SlashCommandHandler } from '../../../../Domain/Bot/SlashCommandHandler.ts';
import type { SlashCommandContext } from '../../../../Domain/Bot/SlashCommandContext.ts';
import CommandHandlerManager from '../../../CommandHandler/CommandHandlerManager.ts';
import { Ping } from '../../../../Application/Query/Ping/Ping.ts';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    SlashCommandBuilder,
} from 'discord.js';

@injectable()
export class PingSlashCommand implements SlashCommandHandler {
    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'ping';
    }

    public builder(): SlashCommandBuilder {
        return (
            new SlashCommandBuilder()
                .setName('ping')
                .setDescription('Replies with a pong!')
                .setContexts(InteractionContextType.Guild) // M1.10/M4.3 — not invokable in DMs.
                .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
                // Open to every member — this is not an admin command. Explicit
                // `null` (rather than leaving the call out) documents that on
                // purpose, matching the other three top-level commands.
                .setDefaultMemberPermissions(null)
        );
    }

    async handle(context: SlashCommandContext): Promise<void> {
        await this.commandHandlerManager.handle(new Ping());

        await context.interaction.reply('pong! 🏓');
    }
}
