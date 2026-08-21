import { inject, injectable } from 'inversify';
import type { SlashCommandHandler } from '../../../../../Domain/Bot/SlashCommandHandler';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import {
    ApplicationIntegrationType,
    InteractionContextType,
    Locale,
    MessageFlags,
    SlashCommandBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import { OptOutSubcommand } from './OptOutSubcommand';
import { OptInSubcommand } from './OptInSubcommand';
import { DeleteDataSubcommand } from './DeleteDataSubcommand';
import { safeReply } from '../../../../../Domain/Bot/safeReply';

// Same convention as MarketplaceSlashCommand.ts: PortugueseBR is the closest
// Discord locale enum entry to pt-PT (Discord has no separate pt-PT value),
// used only for `setDescriptionLocalizations` — every reply string below is
// still written in pt-PT directly.
const PT_LOCALE = Locale.PortugueseBR;

/**
 * M9.7 — a member's self-service privacy controls: opt out of / back into
 * the public portal, and request permanent erasure. Every reply is
 * ephemeral, matching the item's requirement — nothing here is ever visible
 * to the rest of the channel.
 */
@injectable()
export class PrivacySlashCommand implements SlashCommandHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(OptOutSubcommand) private readonly optOutSubcommand: OptOutSubcommand,
        @inject(OptInSubcommand) private readonly optInSubcommand: OptInSubcommand,
        @inject(DeleteDataSubcommand) private readonly deleteDataSubcommand: DeleteDataSubcommand,
    ) {}

    public getName(): string {
        return 'privacy';
    }

    public builder(): SlashCommandSubcommandsOnlyBuilder {
        return (
            new SlashCommandBuilder()
                .setName('privacy')
                .setDescription('Manage your privacy on the community portal')
                .setDescriptionLocalizations({
                    [PT_LOCALE]: 'Gere a tua privacidade no portal da comunidade',
                })
                .setContexts(InteractionContextType.Guild) // M1.10/M4.3 — not invokable in DMs.
                .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
                // Open to every member — this is entirely self-service, about
                // the invoking member's own data. Explicit `null` documents
                // that on purpose, same as every other top-level command here.
                .setDefaultMemberPermissions(null)
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('opt-out')
                        .setDescription(
                            'Hide your marketplace/screenshot/trophy content from the public portal',
                        )
                        .setDescriptionLocalizations({
                            [PT_LOCALE]:
                                'Esconde os teus anúncios, screenshots e perfil de troféus do portal público',
                        }),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('opt-in')
                        .setDescription('Make your content visible on the public portal again')
                        .setDescriptionLocalizations({
                            [PT_LOCALE]: 'Volta a tornar o teu conteúdo visível no portal público',
                        }),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('delete-data')
                        .setDescription(
                            'Permanently delete all your ads, screenshots and trophy profile',
                        )
                        .setDescriptionLocalizations({
                            [PT_LOCALE]:
                                'Apaga permanentemente todos os teus anúncios, screenshots e perfil de troféus',
                        })
                        .addStringOption((option) =>
                            option
                                .setName('confirmar')
                                .setDescription('Type APAGAR to confirm')
                                .setDescriptionLocalizations({
                                    [PT_LOCALE]: 'Escreve APAGAR para confirmar',
                                })
                                .setRequired(true),
                        ),
                )
        );
    }

    async handle(context: SlashCommandContext): Promise<void> {
        const subcommand = context.interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'opt-out':
                    await this.optOutSubcommand.handle(context);
                    break;
                case 'opt-in':
                    await this.optInSubcommand.handle(context);
                    break;
                case 'delete-data':
                    await this.deleteDataSubcommand.handle(context);
                    break;
                default:
                    await context.interaction.reply({
                        content: `Subcomando desconhecido: ${subcommand}`,
                        flags: MessageFlags.Ephemeral,
                    });
            }
        } catch (error) {
            this.logger.error('Error handling privacy command', {
                error: error instanceof Error ? error.message : 'Unknown error',
                subcommand,
            });

            await safeReply(context.interaction, {
                content: 'Ocorreu um erro ao processar o comando.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
