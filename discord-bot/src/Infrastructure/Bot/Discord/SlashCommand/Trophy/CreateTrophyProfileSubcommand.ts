import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { MessageFlags } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { CreateProfile } from '../../../../../Application/Write/Trophy/CreateProfile/CreateProfile';
import { TrophyProfileId } from '../../../../../Domain/Trophy/TrophyProfileId';
import { ProfileAlreadyExists } from '../../../../../Application/Write/Trophy/CreateProfile/ProfileAlreadyExists';
import { safeReply } from '../../../../../Domain/Bot/safeReply';
import { extractPsnProfileFromUrl } from '../../../../../Domain/Trophy/PsnProfileUrl';

@injectable()
export class CreateTrophyProfileSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
    ) {}

    public getName(): string {
        return 'trophy create';
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const psnprofilesUrl = context.interaction.options.getString('psnprofiles_url', true);

        // M7.5: accepts both a bare profile URL
        // (https://psnprofiles.com/username) and a 6-segment trophy URL
        // (https://psnprofiles.com/trophies/<id>-<game>/username) — see
        // Domain/Trophy/PsnProfileUrl.ts.
        const psnProfile = extractPsnProfileFromUrl(psnprofilesUrl);

        if (!psnProfile) {
            await context.interaction.reply({
                content:
                    'URL do PSNProfiles inválido. Indica um URL de perfil válido ' +
                    '(ex: https://psnprofiles.com/username) ou de um troféu ' +
                    '(ex: https://psnprofiles.com/trophies/123-jogo/username).',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Deferred only after the cheap synchronous URL validation above —
        // everything past this point writes to the database, which can take
        // longer than the 3s interaction-ack window.
        await context.interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const command = new CreateProfile(
                TrophyProfileId.generate(),
                context.interaction.user.id,
                psnProfile,
            );

            await this.commandHandlerManager.handle(command);

            await context.interaction.editReply({
                content: `Perfil PSN registado com sucesso: ${psnProfile}`,
            });
        } catch (error) {
            if (error instanceof ProfileAlreadyExists) {
                if (error.userId === context.interaction.user.id) {
                    await safeReply(context.interaction, {
                        content: 'Já tens este perfil PSN registado.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                await safeReply(context.interaction, {
                    content:
                        'Este perfil PSN já foi registado por outra pessoa. Se achas que isto é ' +
                        'um erro, contacta um administrador.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            this.logger.error('Error creating trophy profile', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: context.interaction.user.id,
                psnProfile,
            });

            await safeReply(context.interaction, {
                content: 'Ocorreu um erro ao registar o teu perfil PSN.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}
