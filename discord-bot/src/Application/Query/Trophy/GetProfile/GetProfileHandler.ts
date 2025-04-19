import { inject, injectable } from "inversify";
import type CommandHandler from "../../../../Domain/Command/CommandHandler";
import { GetProfile } from "./GetProfile";
import type { TrophyProfileRepository } from "../../../../Domain/Trophy/TrophyProfileRepository";
import { TYPES } from "../../../../Infrastructure/DependencyInjection/types";
import type Logger from "../../../Logger/Logger";
import type { TrophyProfile } from "../../../../Domain/Trophy/TrophyProfile";
import { ProfileNotFound } from "./ProfileNotFound";

@injectable()
export class GetProfileHandler implements CommandHandler<GetProfile> {
    constructor(
        @inject(TYPES.TrophyProfileRepository) private readonly trophyProfileRepository: TrophyProfileRepository,
        @inject(TYPES.Logger) private readonly logger: Logger
    ) {}

    async handle(command: GetProfile): Promise<TrophyProfile> {
        const profile = await this.trophyProfileRepository.findByUserId(command.userId);

        if (profile === null) {
            this.logger.warn('Trophy profile not found', {
                userId: command.userId
            });

            throw new ProfileNotFound(command.userId);
        }

        this.logger.info('Trophy profile retrieved successfully', {
            userId: command.userId,
            psnProfile: profile.psnProfile
        });

        return profile;
    }
}
