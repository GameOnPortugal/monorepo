import {inject, injectable} from "inversify";
import {Client, Events, GatewayIntentBits, MessageFlags, REST, Routes} from "discord.js";
import {TYPES} from "../../DependencyInjection/types.ts";
import type Logger from "../../../Application/Logger/Logger.ts";
import type { Bot } from "../../../Domain/Bot/Bot.ts";
import {BotExecutor} from "../BotExecutor.ts";
import type {SlashCommandContext} from "../../../Domain/Bot/SlashCommandContext.ts";

@injectable()
export class DiscordBot implements Bot {
    private readonly client: Client;

    constructor(
        private readonly token: string,
        private readonly clientId: string,
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(BotExecutor) private readonly botExecutor: BotExecutor,
    ) {
        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    }

    async start(): Promise<void>
    {
        await this.registerSlashCommands();

        this.client.once(Events.ClientReady, readyClient => {
            this.logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const slashCommandContext: SlashCommandContext = {
                channel_id: interaction.channelId,
                command: interaction.commandName,
                text: '',
                client: this.client,
                interaction: interaction,
            };

            try {
                await this.botExecutor.execute(slashCommandContext)
            } catch (error: any) {
                this.logger.error('error happened' , error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
                }
            }
        });

        await this.client.login(this.token);
    }

    private async registerSlashCommands(): Promise<void> {
        const rest = new REST().setToken(this.token);
        const commands = [];
        for (const handler of this.botExecutor.slashCommandHandlers) {
            commands.push(handler.builder().toJSON());
        }

        try {
            this.logger.log(`Started refreshing ${commands.length} application (/) commands.`);

            // The put method is used to fully refresh all commands in the guild with the current set
            const data = await rest.put(
                Routes.applicationCommands(this.clientId),
                { body: commands },
            ) as any;

            this.logger.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            // And of course, make sure you catch and log any errors!
            console.error(error);
        }
    }
}
