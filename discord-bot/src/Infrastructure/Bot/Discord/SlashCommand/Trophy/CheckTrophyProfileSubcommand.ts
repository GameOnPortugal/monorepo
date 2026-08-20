import { inject, injectable } from 'inversify';
import type { SlashCommandContext } from '../../../../../Domain/Bot/SlashCommandContext';
import { EmbedBuilder } from 'discord.js';
import { TYPES } from '../../../../DependencyInjection/types';
import type Logger from '../../../../../Application/Logger/Logger';
import CommandHandlerManager from '../../../../CommandHandler/CommandHandlerManager';
import { GetProfile } from '../../../../../Application/Query/Trophy/GetProfile/GetProfile';
import { ProfileNotFound } from '../../../../../Application/Query/Trophy/GetProfile/ProfileNotFound';
import { replyPrivately } from '../../../../../Domain/Bot/safeReply';
import type { TrophySource } from '../../../../../Domain/Trophy/TrophySource';
import type { TrophyProfile } from '../../../../../Domain/Trophy/TrophyProfile';

@injectable()
export class CheckTrophyProfileSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.TrophySource) private readonly trophySource: TrophySource,
    ) {}

    public async handle(context: SlashCommandContext): Promise<void> {
        const targetUser = context.interaction.options.getUser('user') ?? context.interaction.user;

        // Public defer: a trophy profile check is worth showing off, so the
        // success path stays public (no `flags`). The not-found/error paths
        // below must NOT inherit that publicness -- they use replyPrivately()
        // to delete the public "thinking..." placeholder and follow up
        // ephemerally instead (M0.3: this is exactly the ephemeral-leak that
        // was fixed in production once already).
        await context.interaction.deferReply();

        try {
            const command = new GetProfile(targetUser.id);
            const profile = await this.commandHandlerManager.handle(command);
            const rankLine = await this.buildRankLine(profile);

            const embed = new EmbedBuilder()
                .setColor(profile.isBanned ? 0xff0000 : profile.hasLeft ? 0xffa500 : 0x00ff00)
                .setTitle(`🎮 Perfil PSN: ${profile.psnProfile}`)
                .setDescription(`Perfil de ${targetUser}`)
                .addFields(
                    {
                        name: '📊 Estado',
                        value: [
                            `${profile.isBanned ? '🚫' : '✅'} Banido: ${profile.isBanned ? 'Sim' : 'Não'}`,
                            `${profile.hasLeft ? '👋' : '🏃'} Saiu do servidor: ${profile.hasLeft ? 'Sim' : 'Não'}`,
                            `${profile.isExcluded ? '❌' : '✨'} Excluído do ranking: ${profile.isExcluded ? 'Sim' : 'Não'}`,
                        ].join('\n'),
                        inline: true,
                    },
                    {
                        name: '📅 Datas',
                        value: [
                            `🆕 Registado: ${profile.createdAt.toLocaleDateString('pt-PT')}`,
                            `🔄 Última atualização: ${profile.updatedAt.toLocaleDateString('pt-PT')}`,
                        ].join('\n'),
                        inline: true,
                    },
                    {
                        name: '🏆 Rank',
                        value: rankLine,
                        inline: false,
                    },
                )
                .setFooter({ text: 'Estado do perfil PSN' })
                .setTimestamp();

            await context.interaction.editReply({
                embeds: [embed],
            });
        } catch (error) {
            if (error instanceof ProfileNotFound) {
                await replyPrivately(context.interaction, {
                    content:
                        targetUser.id === context.interaction.user.id
                            ? '❌ Ainda não registaste o teu perfil PSN. Usa `/trophy create` para o registar.'
                            : '❌ Este utilizador ainda não registou o perfil PSN.',
                });
                return;
            }

            this.logger.error('Error getting trophy profile', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: targetUser.id,
            });

            await replyPrivately(context.interaction, {
                content: '⚠️ Ocorreu um erro ao obter o perfil PSN.',
            });
        }
    }

    /**
     * M7.4 — restores the live world/national rank lookup the rewrite
     * dropped (`docs/discord-bot-feature-gap.md` §4.5). Banned/left
     * profiles get their own message instead of a live lookup — there is
     * nothing current to show, and for a banned profile a PSNProfiles
     * lookup would just reconfirm the stored flag at the cost of a network
     * call. A live-lookup failure (PSNProfiles down, network hiccup)
     * degrades to an apologetic line rather than failing the whole command
     * — the rest of the profile embed is still useful without it.
     */
    private async buildRankLine(profile: TrophyProfile): Promise<string> {
        if (profile.isBanned) {
            return '🚫 Perfil banido no PSNProfiles.';
        }

        if (profile.hasLeft) {
            return '👋 Este membro já não está no servidor.';
        }

        if (!profile.psnProfile) {
            return '⚠️ Sem perfil PSN associado.';
        }

        try {
            const rank = await this.trophySource.getProfileRank(profile.psnProfile);

            if (rank.worldRank === null && rank.countryRank === null) {
                return '⚠️ Não foi possível obter o rank (perfil pode estar privado ou em baixo no PSNProfiles).';
            }

            const worldRankText =
                rank.worldRank !== null ? `#${rank.worldRank.toLocaleString('pt-PT')}` : '—';
            const countryRankText =
                rank.countryRank !== null ? `#${rank.countryRank.toLocaleString('pt-PT')}` : '—';

            return `🌍 Posição mundial: ${worldRankText} | 🇵🇹 Posição nacional: ${countryRankText}`;
        } catch (error) {
            this.logger.error('Error fetching live PSNProfiles rank', {
                error: error instanceof Error ? error.message : 'Unknown error',
                psnProfile: profile.psnProfile,
            });

            return '⚠️ Não foi possível obter o rank em tempo real neste momento.';
        }
    }
}
