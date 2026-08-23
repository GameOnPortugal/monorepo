import { inject, injectable } from 'inversify';
import type { SlashCommandHandler } from '../../../../../Domain/Bot/SlashCommandHandler';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import { CreateTrophyProfileSubcommand } from './CreateTrophyProfileSubcommand';
import { CheckTrophyProfileSubcommand } from './CheckTrophyProfileSubcommand';
import { RankSubcommand } from './RankSubcommand.ts';
import { safeReply } from '../../../../../Domain/Bot/safeReply.ts';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages';
import { PT_LOCALE } from '../../../../../Domain/Bot/I18n/BotLocale';

/**
 * The `month` option's choices. Split out of `builder()` only because the
 * localised list is long — the English `name` is what Discord stores, the
 * pt-PT `name_localizations` is what a Portuguese client renders.
 */
const MONTH_CHOICES: { name: string; value: string; name_localizations: Record<string, string> }[] =
    [
        { name: 'Current Month', value: 'current', pt: 'Mês actual' },
        { name: 'Last Month', value: 'last', pt: 'Mês anterior' },
        { name: 'January', value: '1', pt: 'Janeiro' },
        { name: 'February', value: '2', pt: 'Fevereiro' },
        { name: 'March', value: '3', pt: 'Março' },
        { name: 'April', value: '4', pt: 'Abril' },
        { name: 'May', value: '5', pt: 'Maio' },
        { name: 'June', value: '6', pt: 'Junho' },
        { name: 'July', value: '7', pt: 'Julho' },
        { name: 'August', value: '8', pt: 'Agosto' },
        { name: 'September', value: '9', pt: 'Setembro' },
        { name: 'October', value: '10', pt: 'Outubro' },
        { name: 'November', value: '11', pt: 'Novembro' },
        { name: 'December', value: '12', pt: 'Dezembro' },
    ].map(({ name, value, pt }) => ({
        name,
        value,
        name_localizations: { [PT_LOCALE]: pt },
    }));

@injectable()
export class TrophySlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CreateTrophyProfileSubcommand)
        private readonly createTrophyProfileSubcommand: CreateTrophyProfileSubcommand,
        @inject(CheckTrophyProfileSubcommand)
        private readonly checkTrophyProfileSubcommand: CheckTrophyProfileSubcommand,
        @inject(RankSubcommand) private readonly getRankSubcommand: RankSubcommand,
    ) {}

    public getName(): string {
        return 'trophy';
    }

    public builder(): SlashCommandSubcommandsOnlyBuilder {
        const currentYear = new Date().getFullYear();
        const yearChoices = Array.from({ length: 5 }, (_, i) => ({
            name: `${currentYear - i}`,
            value: `${currentYear - i}`,
        }));

        return (
            new SlashCommandBuilder()
                .setName('trophy')
                .setDescription('Manage trophy profiles and submissions')
                .setDescriptionLocalizations({
                    [PT_LOCALE]: 'Gere os perfis e submissões de troféus',
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
                        .setDescription('Register your PSN profile for trophy tracking')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Regista o teu perfil PSN para contagem de troféus',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('psnprofiles_url')
                                .setDescription('Your PSNProfiles.com profile URL')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'O URL do teu perfil no PSNProfiles.com',
                                })
                                .setRequired(true),
                        ),
                )
                // Check subcommand
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('check')
                        .setDescription('Get PSN profile information')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Mostra a informação de um perfil PSN',
                        })
                        .addUserOption((option) =>
                            option
                                .setName('user')
                                .setDescription(
                                    'User to get PSN profile for (defaults to yourself)',
                                )
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Utilizador (por omissão, tu próprio)',
                                })
                                .setRequired(false),
                        ),
                )
                // Rank subcommand
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('rank')
                        .setDescription('View trophy rankings')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Consulta os rankings de troféus',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('Type of ranking to view')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Tipo de ranking a consultar',
                                })
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name: '📅 Monthly Rankings',
                                        value: 'monthly',
                                        name_localizations: { [PT_LOCALE]: '📅 Ranking mensal' },
                                    },
                                    {
                                        name: '🎮 Since Creation Rankings',
                                        value: 'creation',
                                        name_localizations: {
                                            [PT_LOCALE]: '🎮 Ranking desde sempre',
                                        },
                                    },
                                    {
                                        name: '🏆 Lifetime Rankings',
                                        value: 'lifetime',
                                        name_localizations: { [PT_LOCALE]: '🏆 Ranking vitalício' },
                                    },
                                    {
                                        name: '📊 User Rankings',
                                        value: 'user',
                                        name_localizations: {
                                            [PT_LOCALE]: '📊 Ranking de um utilizador',
                                        },
                                    },
                                ),
                        )
                        .addUserOption((option) =>
                            option
                                .setName('user')
                                .setDescription('User to view rankings for (defaults to yourself)')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Utilizador (por omissão, tu próprio)',
                                })
                                .setRequired(false),
                        )
                        .addIntegerOption((option) =>
                            option
                                .setName('limit')
                                // M7.6: no longer a hard cap on the whole
                                // ranking — pagination buttons on the
                                // result page take you past it.
                                .setDescription('Results per page (default: 10)')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Resultados por página (padrão: 10)',
                                })
                                .setMinValue(1)
                                .setMaxValue(10)
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('month')
                                .setDescription('Month to view (current, last, or 1-12)')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Mês a consultar (actual, anterior, ou 1-12)',
                                })
                                .setRequired(false)
                                .addChoices(...MONTH_CHOICES),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('year')
                                .setDescription('Year to view (defaults to current year)')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Ano a consultar (por omissão, o ano actual)',
                                })
                                .setRequired(false)
                                .addChoices(...yearChoices),
                        ),
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
                        content: messagesFor(context.interaction).common.unknownSubcommand(
                            subcommand,
                        ),
                        flags: MessageFlags.Ephemeral,
                    });
            }
        } catch (error) {
            this.logger.error('Error handling trophy command', {
                error: error instanceof Error ? error.message : 'Unknown error',
                subcommand,
            });

            // The subcommand handler may already have replied (or deferred)
            // before throwing; safeReply avoids InteractionAlreadyReplied
            // masking the real error above.
            await safeReply(context.interaction, {
                content: messagesFor(context.interaction).common.commandError,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
