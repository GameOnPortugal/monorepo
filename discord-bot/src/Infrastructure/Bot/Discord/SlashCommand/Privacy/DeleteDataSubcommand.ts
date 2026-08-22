import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { DeleteMemberData } from '../../../../../Application/Write/Privacy/DeleteMemberData/DeleteMemberData';
import type { DeleteMemberDataResult } from '../../../../../Application/Write/Privacy/DeleteMemberData/DeleteMemberDataResult';
import { safeReply } from '../../../../../Domain/Bot/safeReply';
import { messagesFor } from '../../../../../Domain/Bot/I18n/messages';

/**
 * Exact text a member must type to confirm the irreversible erasure.
 *
 * Deliberately **not** localised, even though the surrounding copy is: the
 * confirmation is a fixed token, and accepting a second spelling would mean
 * two ways to trigger an irreversible delete. The instruction telling the
 * member what to type *is* localised, so an English-speaking member is told
 * to type `APAGAR` in English.
 */
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
        const m = messagesFor(context.interaction).privacy;

        if (confirmation !== CONFIRMATION_PHRASE) {
            await context.interaction.reply({
                content: m.confirmationRequired(CONFIRMATION_PHRASE),
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
                content: m.dataDeleted(
                    result.adsDeleted,
                    result.screenshotsDeleted,
                    result.trophyProfileDeleted
                        ? m.trophyProfileAlsoDeleted(result.trophiesDeleted)
                        : m.nothingElseDeleted,
                ),
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
                content: m.deleteError,
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
