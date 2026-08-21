import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { DeleteMemberData } from '../../../../../Application/Write/Privacy/DeleteMemberData/DeleteMemberData';
import type { DeleteMemberDataResult } from '../../../../../Application/Write/Privacy/DeleteMemberData/DeleteMemberDataResult';
import { safeReply } from '../../../../../Domain/Bot/safeReply';

/** Exact text a member must type to confirm the irreversible erasure. */
const CONFIRMATION_PHRASE = 'APAGAR';

@injectable()
export class DeleteDataSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'privacy delete-data';
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const discordId = context.interaction.user.id;
        const confirmation = context.interaction.options.getString('confirmar', true);

        if (confirmation !== CONFIRMATION_PHRASE) {
            await context.interaction.reply({
                content:
                    `⚠️ Para confirmares, escreve exatamente \`${CONFIRMATION_PHRASE}\` na opção ` +
                    '`confirmar`. Esta ação apaga permanentemente os teus anúncios, screenshots ' +
                    'e perfil de troféus — não pode ser desfeita.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await context.interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result: DeleteMemberDataResult = await this.commandHandlerManager.handle(
                new DeleteMemberData(discordId),
            );

            await context.interaction.editReply({
                content:
                    '🗑️ Os teus dados foram apagados permanentemente: ' +
                    `${result.adsDeleted} anúncio(s), ${result.screenshotsDeleted} screenshot(s)` +
                    (result.trophyProfileDeleted
                        ? ` e o teu perfil de troféus (${result.trophiesDeleted} troféu(s)).`
                        : '.') +
                    ' Se voltares a usar o bot, o teu histórico começa do zero.',
            });

            this.logger.info('Member data erased via /privacy delete-data', {
                discordId,
                ...result,
            });
        } catch (error) {
            this.logger.error('Error deleting member data', {
                error: error instanceof Error ? error.message : 'Unknown error',
                discordId,
            });

            await safeReply(context.interaction, {
                content:
                    'Ocorreu um erro ao apagar os teus dados. Tenta novamente ou contacta um ' +
                    'moderador.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
