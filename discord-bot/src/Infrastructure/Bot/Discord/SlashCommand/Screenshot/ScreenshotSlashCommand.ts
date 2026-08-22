import { inject, injectable } from 'inversify';
import type { SlashCommandHandler } from '../../../../../Domain/Bot/SlashCommandHandler.ts';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext.ts';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types.ts';
import type Logger from '../../../../../Application/Logger/Logger.ts';
import { CreateScreenshotSubcommand } from './CreateScreenshotSubcommand.ts';
import { ListScreenshotSubcommand } from './ListScreenshotSubcommand.ts';
import { DeleteScreenshotSubcommand } from './DeleteScreenshotSubcommand.ts';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages.ts';
import { PT_LOCALE } from '../../../../../Domain/Bot/I18n/BotLocale.ts';

@injectable()
export class ScreenshotSlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CreateScreenshotSubcommand)
        private readonly createScreenshotSubcommand: CreateScreenshotSubcommand,
        @inject(ListScreenshotSubcommand)
        private readonly listScreenshotSubcommand: ListScreenshotSubcommand,
        @inject(DeleteScreenshotSubcommand)
        private readonly deleteScreenshotSubcommand: DeleteScreenshotSubcommand,
    ) {}

    public getName(): string {
        return 'screenshot';
    }

    public builder(): SlashCommandSubcommandsOnlyBuilder {
        return (
            new SlashCommandBuilder()
                .setName('screenshot')
                .setDescription('Manage screenshots for the contest')
                .setDescriptionLocalizations({
                    [PT_LOCALE]: 'Gere as screenshots do concurso',
                })
                .setContexts(InteractionContextType.Guild) // M1.10/M4.3 — not invokable in DMs.
                .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
                // Open to every member — no subcommand here is admin-only.
                // Explicit `null` documents that on purpose.
                .setDefaultMemberPermissions(null)
                // Create subcommand
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('create')
                        .setDescription('Submit a new screenshot to the contest')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Submete uma nova screenshot para o concurso',
                        })
                        .addAttachmentOption((option) =>
                            option
                                .setName('image')
                                .setDescription('The screenshot you want to submit')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'A screenshot que queres submeter',
                                })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('name')
                                .setDescription('Name for your screenshot')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Nome para a tua screenshot',
                                })
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('platform')
                                .setDescription('Platform the screenshot was taken on')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Plataforma onde tiraste a screenshot',
                                })
                                .setRequired(true)
                                .addChoices(
                                    { name: 'PlayStation', value: 'playstation' },
                                    { name: 'Xbox', value: 'xbox' },
                                    { name: 'Nintendo Switch', value: 'switch' },
                                    { name: 'PC', value: 'pc' },
                                    { name: 'Mobile', value: 'mobile' },
                                    {
                                        name: 'Other',
                                        value: 'other',
                                        name_localizations: { [PT_LOCALE]: 'Outra' },
                                    },
                                ),
                        ),
                )
                // List subcommand
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription('List submitted screenshots')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Lista as screenshots submetidas',
                        })
                        .addUserOption((option) =>
                            option
                                .setName('user')
                                .setDescription(
                                    'User whose screenshots to view (defaults to yourself)',
                                )
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Utilizador (por omissão, tu próprio)',
                                })
                                .setRequired(false),
                        ),
                )
                // Delete subcommand
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('delete')
                        .setDescription('Delete one of your screenshots')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Apaga uma das tuas screenshots',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID of the screenshot to delete')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'ID da screenshot a apagar',
                                })
                                .setRequired(true)
                                // M4.8 — ScreenshotAutocompleteHandler fills
                                // this in from the member's own screenshots.
                                .setAutocomplete(true),
                        ),
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
                        content: messagesFor(interaction).screenshot.unknownSubcommand,
                        flags: MessageFlags.Ephemeral,
                    });
            }
        } catch (error) {
            // The subcommand handler may already have replied (or deferred)
            // before throwing, so this must not blindly call `.reply()` —
            // that would throw `InteractionAlreadyReplied` and swallow the
            // real error above. See safeReply() for the branching logic.
            await safeReply(interaction, {
                content: messagesFor(interaction).screenshot.commandError,
                flags: MessageFlags.Ephemeral,
            });
            this.logger.error('Error processing screenshot command', { error });
        }
    }
}
