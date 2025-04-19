import {inject, injectable} from "inversify";
import type {SlashCommandHandler} from "../../../../../Domain/Bot/SlashCommandHandler";
import type {SlashCommandContext} from "../../../../../Domain/Bot/SlashCommandContext";
import {MessageFlags, SlashCommandBuilder} from "discord.js";
import {TYPES} from "../../../../DependencyInjection/types";
import type Logger from "../../../../../Application/Logger/Logger";
import {CreateTrophyProfileSubcommand} from "./CreateTrophyProfileSubcommand";
import {CheckTrophyProfileSubcommand} from "./CheckTrophyProfileSubcommand";
import {RankSubcommand} from "./RankSubcommand.ts";

@injectable()
export class TrophySlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CreateTrophyProfileSubcommand) private readonly createTrophyProfileSubcommand: CreateTrophyProfileSubcommand,
        @inject(CheckTrophyProfileSubcommand) private readonly checkTrophyProfileSubcommand: CheckTrophyProfileSubcommand,
        @inject(RankSubcommand) private readonly getRankSubcommand: RankSubcommand
    ) {}

    public getName(): string {
        return "trophy";
    }

    public builder(): any {
        const currentYear = new Date().getFullYear();
        const yearChoices = Array.from({ length: 5 }, (_, i) => ({
            name: `${currentYear - i}`,
            value: `${currentYear - i}`
        }));

        return new SlashCommandBuilder()
            .setName('trophy')
            .setDescription("Manage trophy profiles and submissions")
            // Create subcommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('create')
                    .setDescription('Register your PSN profile for trophy tracking')
                    .addStringOption(option =>
                        option.setName('psnprofiles_url')
                            .setDescription('Your PSNProfiles.com profile URL')
                            .setRequired(true)
                    )
            )
            // Check subcommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('check')
                    .setDescription('Get PSN profile information')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to get PSN profile for (defaults to yourself)')
                            .setRequired(false)
                    )
            )
            // Rank subcommand
            .addSubcommand(subcommand =>
                subcommand
                    .setName('rank')
                    .setDescription('View trophy rankings')
                    .addStringOption(option =>
                        option.setName('type')
                            .setDescription('Type of ranking to view')
                            .setRequired(true)
                            .addChoices(
                                { name: '📅 Monthly Rankings', value: 'monthly' },
                                { name: '🎮 Since Creation Rankings', value: 'creation' },
                                { name: '🏆 Lifetime Rankings', value: 'lifetime' },
                                { name: '📊 User Rankings', value: 'user' }
                            )
                    )
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to view rankings for (defaults to yourself)')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('limit')
                            .setDescription('Number of results to show (default: 10)')
                            .setMinValue(1)
                            .setMaxValue(10)
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('month')
                            .setDescription('Month to view (current, last, or 1-12)')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Current Month', value: 'current' },
                                { name: 'Last Month', value: 'last' },
                                { name: 'January', value: '1' },
                                { name: 'February', value: '2' },
                                { name: 'March', value: '3' },
                                { name: 'April', value: '4' },
                                { name: 'May', value: '5' },
                                { name: 'June', value: '6' },
                                { name: 'July', value: '7' },
                                { name: 'August', value: '8' },
                                { name: 'September', value: '9' },
                                { name: 'October', value: '10' },
                                { name: 'November', value: '11' },
                                { name: 'December', value: '12' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('year')
                            .setDescription('Year to view (defaults to current year)')
                            .setRequired(false)
                            .addChoices(...yearChoices)
                    )
            );
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const subcommand = context.interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'create':
                    await this.createTrophyProfileSubcommand.handle(context);
                    break;
                case 'check':
                    await this.checkTrophyProfileSubcommand.handle(context);
                    break;
                case 'rank':
                    await this.getRankSubcommand.handle(context);
                    break;
                default:
                    await context.interaction.reply({
                        content: `Unknown subcommand: ${subcommand}`,
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            this.logger.error('Error handling trophy command', {
                error: error instanceof Error ? error.message : 'Unknown error',
                subcommand
            });

            await context.interaction.reply({
                content: 'An error occurred while processing your command.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
