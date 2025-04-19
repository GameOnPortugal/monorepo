import { inject, injectable } from "inversify";
import type { SlashCommandHandler } from "../../../../../Domain/Bot/SlashCommandHandler";
import type { SlashCommandContext } from "../../../../../Domain/Bot/SlashCommandContext";
import { SlashCommandBuilder } from "discord.js";
import { TYPES } from "../../../../DependencyInjection/types";
import type Logger from "../../../../../Application/Logger/Logger";
import { SellSubcommand } from "./SellSubcommand";
import { ListAdsSubcommand } from "./ListAdsSubcommand";
import { DeleteAdSubcommand } from "./DeleteAdSubcommand";

@injectable()
export class MarketplaceSlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(SellSubcommand) private readonly sellSubcommand: SellSubcommand,
        @inject(ListAdsSubcommand) private readonly listAdsSubcommand: ListAdsSubcommand,
        @inject(DeleteAdSubcommand) private readonly deleteAdSubcommand: DeleteAdSubcommand
    ) {}

    public getName(): string {
        return "marketplace";
    }

    public builder(): any {
        return new SlashCommandBuilder()
            .setName('marketplace')
            .setDescription("Manage marketplace listings")
            .addSubcommand(subcommand =>
                subcommand
                    .setName('sell')
                    .setDescription('Create a new sale listing')
                    .addStringOption(option =>
                        option.setName('name')
                            .setDescription('Name of the item')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('price')
                            .setDescription('Price of the item')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('state')
                            .setDescription('Condition of the item')
                            .setRequired(true)
                            .addChoices(
                                { name: 'New', value: 'new' },
                                { name: 'Like new', value: 'like_new' },
                                { name: 'Used - Good condition', value: 'used_good' },
                                { name: 'Used - With marks', value: 'used_marks' },
                                { name: 'Broken', value: 'broken' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('zone')
                            .setDescription('Your location')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('dispatch')
                            .setDescription('Dispatch method')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Included', value: 'included' },
                                { name: 'Not included', value: 'not_included' },
                                { name: 'Face to face', value: 'face_to_face' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('warranty')
                            .setDescription('Warranty information')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('description')
                            .setDescription('Description of the item')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List marketplace items from a user')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to list items from (defaults to yourself)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('delete')
                    .setDescription('Delete one of your marketplace items')
                    .addStringOption(option =>
                        option.setName('id')
                            .setDescription('ID of the item to delete')
                            .setRequired(true)
                    )
            );
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const subcommand = context.interaction.options.getSubcommand();

        switch (subcommand) {
            case 'sell':
                await this.sellSubcommand.handle(context);
                break;
            case 'list':
                await this.listAdsSubcommand.handle(context);
                break;
            case 'delete':
                await this.deleteAdSubcommand.handle(context);
                break;
            default:
                this.logger.error('Unknown subcommand', { subcommand });
                await context.interaction.reply({
                    content: 'Unknown subcommand',
                    ephemeral: true
                });
        }
    }
}
