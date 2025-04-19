import {inject, injectable} from "inversify";
import type {SlashCommandContext} from "../../../../../Domain/Bot/SlashCommandContext";
import {MessageFlags} from "discord.js";
import {TYPES} from "../../../../DependencyInjection/types";
import type Logger from "../../../../../Application/Logger/Logger";
import CommandHandlerManager from "../../../../CommandHandler/CommandHandlerManager";
import {CreateProfile} from "../../../../../Application/Write/Trophy/CreateProfile/CreateProfile";
import {TrophyProfileId} from "../../../../../Domain/Trophy/TrophyProfileId";
import {ProfileAlreadyExists} from "../../../../../Application/Write/Trophy/CreateProfile/ProfileAlreadyExists";

@injectable()
export class CreateTrophyProfileSubcommand {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(CommandHandlerManager) private readonly commandHandlerManager: CommandHandlerManager
    ) {
    }

    public getName(): string {
        return "trophy create";
    }

    public async handle(context: SlashCommandContext): Promise<void> {
        const psnprofilesUrl = context.interaction.options.getString('psnprofiles_url', true);
        
        // Extract PSN profile name from URL (e.g., https://psnprofiles.com/username -> username)
        const psnProfile = this.extractPsnProfileFromUrl(psnprofilesUrl);
        
        if (!psnProfile) {
            await context.interaction.reply({
                content: 'Invalid PSNProfiles URL. Please provide a valid profile URL (e.g., https://psnprofiles.com/username)',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        try {
            const command = new CreateProfile(
                TrophyProfileId.generate(),
                context.interaction.user.id,
                psnProfile
            );

            await this.commandHandlerManager.handle(command);

            await context.interaction.reply({
                content: `Successfully registered PSN profile: ${psnProfile}`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            if (error instanceof ProfileAlreadyExists) {
                if (error.userId === context.interaction.user.id) {
                    await context.interaction.reply({
                        content: 'You have already registered this PSN profile.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await context.interaction.reply({
                    content: 'Someone else has already registered this PSN profile. If you think this is an error please report to an administrator',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            this.logger.error('Error creating trophy profile', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: context.interaction.user.id,
                psnProfile
            });

            await context.interaction.reply({
                content: 'An error occurred while registering your PSN profile.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    private extractPsnProfileFromUrl(url: string): string | null {
        try {
            if (!url.startsWith('https://psnprofiles.com/')) {
                return null;
            }

            const parsedUrl = new URL(url);
            if (parsedUrl.hostname !== 'psnprofiles.com') {
                return null;
            }
            
            // The PSN username should be the first path segment
            const username = parsedUrl.pathname.split('/')[1];
            return username || null;
            
        } catch {
            return null;
        }
    }
}
