import {inject, injectable} from "inversify";
import type {SlashCommandHandler} from "../../../../../Domain/Bot/SlashCommandHandler.ts";
import type {SlashCommandContext} from "../../../../../Domain/Bot/SlashCommandContext.ts";
import {MessageFlags, SlashCommandBuilder} from "discord.js";
import {TYPES} from "../../../../DependencyInjection/types.ts";
import type Logger from "../../../../../Application/Logger/Logger.ts";
import {CreateScreenshotSubcommand} from "./CreateScreenshotSubcommand.ts";
import {ListScreenshotSubcommand} from "./ListScreenshotSubcommand.ts";
import {DeleteScreenshotSubcommand} from "./DeleteScreenshotSubcommand.ts";

@injectable()
export class ScreenshotSlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CreateScreenshotSubcommand) private readonly createScreenshotSubcommand: CreateScreenshotSubcommand,
        @inject(ListScreenshotSubcommand) private readonly listScreenshotSubcommand: ListScreenshotSubcommand,
        @inject(DeleteScreenshotSubcommand) private readonly deleteScreenshotSubcommand: DeleteScreenshotSubcommand,
    ) {
    }

    public getName(): string {
        return "screenshot";
    }

    public builder(): any {
        return new SlashCommandBuilder()
            .setName('screenshot')
            .setDescription("Manage screenshots for the contest")
            // Create subcommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('create')
                    .setDescription('Submit a new screenshot to the contest')
                    .addAttachmentOption(option =>
                        option.setName('image')
                            .setDescription('The screenshot you want to submit')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('name')
                            .setDescription('Name for your screenshot')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('platform')
                            .setDescription('Platform the screenshot was taken on')
                            .setRequired(true)
                            .addChoices(
                                {name: 'PlayStation', value: 'playstation'},
                                {name: 'Xbox', value: 'xbox'},
                                {name: 'Nintendo Switch', value: 'switch'},
                                {name: 'PC', value: 'pc'},
                                {name: 'Mobile', value: 'mobile'},
                                {name: 'Other', value: 'other'}
                            )
                    )
            )
            // List subcommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List submitted screenshots')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User whose screenshots to view (defaults to yourself)')
                            .setRequired(false)
                    )
            )
            // Delete subcommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('delete')
                    .setDescription('Delete one of your screenshots')
                    .addStringOption(option =>
                        option.setName('id')
                            .setDescription('ID of the screenshot to delete')
                            .setRequired(true)
                    )
            );
    }

    async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        try {
            // Get the subcommand that was used
            const subcommand = interaction.options.getSubcommand();

            // Route to the appropriate handler based on the subcommand
            switch (subcommand) {
                case 'create':
                    await this.createScreenshotSubcommand.handle(interaction);
                    break;
                case 'list':
                    await this.listScreenshotSubcommand.handle(interaction);
                    break;
                case 'delete':
                    await this.deleteScreenshotSubcommand.handle(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown subcommand. Please use `/screenshot create`, `/screenshot list`, or `/screenshot delete`.',
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            await interaction.reply('There was an error processing your screenshot command. Please try again later.', {flags: MessageFlags.Ephemeral});
            this.logger.error('Error processing screenshot command', {error});
        }
    }
}
