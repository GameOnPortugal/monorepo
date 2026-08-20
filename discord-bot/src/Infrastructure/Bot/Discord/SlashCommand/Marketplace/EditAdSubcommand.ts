import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import {
    ActionRowBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { GetAd } from '../../../../../Application/Query/Marketplace/GetAd/GetAd';
import { AdId } from '../../../../../Domain/Marketplace/AdId';
import RecordNotFound from '../../../../../Domain/RecordNotFound';
import { InvalidId } from '../../../../../Domain/InvalidId';
import { buildCustomId } from '../../../../../Domain/Bot/CustomId';

/**
 * `/marketplace edit` (M5.6) opens a modal pre-filled with the ad's current
 * price/description rather than taking them as slash-command options — the
 * plan (`06-discord-api-modernisation.md`, "§3c modals → M5.6") calls for
 * modals here, and `mkt:edit-submit:<adId>` is the exact custom ID shape
 * M4.7's own component-routing test already exercises. The submission comes
 * back as a **separate** interaction (a modal submit), handled by
 * `MarketplaceComponentHandler` under the same `mkt` namespace as the
 * buttons.
 *
 * The ownership check here is UX only (fail before opening a modal for
 * someone who can never submit it usefully) — `EditAdHandler` re-checks
 * authoritatively when the modal comes back, per `CustomId.ts`'s "never
 * trust the custom ID" rule.
 */
@injectable()
export class EditAdSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const interaction = context.interaction;
        const identifier = interaction.options.getString('id', true);

        let adId: AdId;
        try {
            adId = AdId.fromString(identifier.trim());
        } catch (error) {
            if (error instanceof InvalidId) {
                await interaction.reply({
                    content:
                        'ID de anúncio inválido. Escolhe um anúncio a partir das sugestões em vez de escreveres o ID à mão.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            throw error;
        }

        try {
            const ad = await this.commandHandlerManager.handle(new GetAd(adId));

            if (ad.authorId !== interaction.user.id) {
                await interaction.reply({
                    content: 'Não tens permissão para editar este anúncio.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(buildCustomId('mkt', 'edit-submit', adId.toString()))
                .setTitle('Editar anúncio')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('price')
                            .setLabel('Preço')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setValue(ad.price ?? ''),
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Descrição')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                            .setValue(ad.description ?? ''),
                    ),
                );

            await interaction.showModal(modal);
        } catch (error) {
            if (error instanceof RecordNotFound) {
                await interaction.reply({
                    content: 'Anúncio não encontrado.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            this.logger.error('Error opening the edit modal', { error, adId: adId.toString() });
            await interaction.reply({
                content: 'Ocorreu um erro ao abrir o formulário de edição. Tenta novamente.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
