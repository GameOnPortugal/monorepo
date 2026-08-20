import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { randomUUID } from 'crypto';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { DeleteAd } from '../../../../../Application/Write/Marketplace/DeleteAd/DeleteAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { UnauthorizedAdDeletion } from '../../../../../Domain/Marketplace/UnauthorizedAdDeletion';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { InvalidId } from '../../../../../Domain/InvalidId';
import { isGuildAdmin } from '../../../../../Domain/Bot/AdminCheck';

@injectable()
export class DeleteAdSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const identifier = interaction.options.getString('id', true);
        const userId = interaction.user.id;
        // M5.10 — read off the interaction's live permission bits, never
        // trusted from anything the member typed. `DeleteAdHandler` still
        // re-derives *ownership* itself off the row (`ad.authorId`); this
        // only carries "is the clicker currently a guild admin" across the
        // Application-layer boundary, same shape as `MarkAdSold.isAdmin`.
        const isAdmin = isGuildAdmin(interaction);

        // Still deferred: the delete itself does a read, a Discord message
        // delete and a write, which is not reliably inside the 3s
        // interaction-ack window. Every reply below is ephemeral, so fixing
        // that at defer time changes nothing about visibility.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // M4.8 — the option is autocompleted (MarketplaceAutocompleteHandler),
        // so `identifier` is an ad id that Discord filled in from the member's
        // own rows. The positional-index fallback that used to live here —
        // "or type 2 for your second ad" — is gone: it resolved the position
        // against a *fresh* ListUserAds query, so an ad created or expired
        // between the member reading `/marketplace list` and typing the
        // number shifted every position after it and deleted the wrong row.
        //
        // The option is still free text, though: a client can send whatever
        // it likes without opening the suggestion list. So parse defensively
        // here, and let DeleteAdHandler own the ownership check.
        let adId: AdId;
        try {
            adId = AdId.fromString(identifier.trim());
        } catch (error) {
            if (error instanceof InvalidId) {
                await interaction.editReply({
                    content:
                        'ID de anúncio inválido. Escolhe um anúncio a partir das sugestões em vez de escreveres o ID à mão.',
                });
                return;
            }
            throw error;
        }

        try {
            await this.commandHandlerManager.handle(new DeleteAd(adId, userId, isAdmin));
            await interaction.editReply({ content: '🗑️ Anúncio apagado com sucesso.' });
        } catch (error) {
            if (error instanceof UnauthorizedAdDeletion) {
                await interaction.editReply({
                    content: 'Não tens permissão para apagar este anúncio.',
                });
            } else if (error instanceof RecordNotFound) {
                await interaction.editReply({
                    content: 'Anúncio não encontrado.',
                });
            } else {
                const correlationId = randomUUID();
                this.logger.error('Error deleting ad', {
                    error,
                    correlationId,
                    adId: adId.toString(),
                    userId,
                });
                await interaction.editReply({
                    content: `Ocorreu um erro ao apagar o anúncio. Tenta novamente. (ref: ${correlationId})`,
                });
            }
        }
    }
}
