import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { randomUUID } from 'crypto';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { BumpAd } from '../../../../../Application/Write/Marketplace/BumpAd/BumpAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import { UnauthorizedAdAction } from '../../../../../Domain/Marketplace/UnauthorizedAdAction';
import { AdNotActive } from '../../../../../Domain/Marketplace/AdNotActive';
import { AdBumpRateLimited } from '../../../../../Domain/Marketplace/AdBumpRateLimited';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { InvalidId } from '../../../../../Domain/InvalidId';
import { DiscordChannels } from '../../../../Community/Discord/DiscordChannels';
import { formatHoursRemaining } from './formatHoursRemaining';

/**
 * `/marketplace bump` (M5.6) — the slash-command twin of the `🔄 Renovar`
 * button. Both go through `BumpAdHandler`; this file only builds the
 * `BumpAd` command from a slash interaction instead of a button click.
 */
@injectable()
export class BumpAdSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const identifier = interaction.options.getString('id', true);
        const userId = interaction.user.id;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
            await this.commandHandlerManager.handle(
                new BumpAd(adId, userId, DiscordChannels.MARKETPLACE),
            );
            await interaction.editReply({ content: '🔄 Anúncio renovado.' });
        } catch (error) {
            if (error instanceof UnauthorizedAdAction) {
                await interaction.editReply({
                    content: 'Não tens permissão para renovar este anúncio.',
                });
            } else if (error instanceof AdNotActive) {
                await interaction.editReply({ content: 'Este anúncio já não está activo.' });
            } else if (error instanceof AdBumpRateLimited) {
                await interaction.editReply({
                    content: `Só podes renovar este anúncio uma vez a cada 72 horas. Tenta novamente daqui a ${formatHoursRemaining(error.nextEligibleAt)}.`,
                });
            } else if (error instanceof RecordNotFound) {
                await interaction.editReply({ content: 'Anúncio não encontrado.' });
            } else {
                const correlationId = randomUUID();
                this.logger.error('Error bumping ad', {
                    error,
                    correlationId,
                    adId: adId.toString(),
                    userId,
                });
                await interaction.editReply({
                    content: `Ocorreu um erro ao renovar o anúncio. Tenta novamente. (ref: ${correlationId})`,
                });
            }
        }
    }
}
