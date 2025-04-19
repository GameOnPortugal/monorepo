import { inject, injectable } from "inversify";
import type CommandHandler from "../../../../Domain/Command/CommandHandler";
import { CreateProfile } from "./CreateProfile";
import type { TrophyProfileRepository } from "../../../../Domain/Trophy/TrophyProfileRepository";
import { TYPES } from "../../../../Infrastructure/DependencyInjection/types";
import type Logger from "../../../Logger/Logger";
import { TrophyProfile } from "../../../../Domain/Trophy/TrophyProfile";
import { ProfileAlreadyExists } from "./ProfileAlreadyExists";

@injectable()
export class CreateProfileHandler implements CommandHandler<CreateProfile> {
  constructor(
    @inject(TYPES.TrophyProfileRepository) private readonly trophyProfileRepository: TrophyProfileRepository,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  async handle(command: CreateProfile): Promise<void> {
    // Check if a profile already exists for this user or PSN profile
    const existingUserProfile = await this.trophyProfileRepository.findByUserId(command.userId);
    const existingPsnProfile = await this.trophyProfileRepository.findByPsnProfile(command.psnProfile);

    if (existingUserProfile !== null || existingPsnProfile !== null) {
      this.logger.warn('Attempted to create duplicate trophy profile', {
        userId: command.userId,
        psnProfile: command.psnProfile,
        existingUserProfile: existingUserProfile?.id.toString(),
        existingPsnProfile: existingPsnProfile?.id.toString()
      });

      throw new ProfileAlreadyExists(command.userId, command.psnProfile);
    }

    // Create a new TrophyProfile entity
    const trophyProfile = new TrophyProfile(
      command.id,
      command.userId,
      command.psnProfile,
      false, // isBanned
      false, // hasLeft
      false, // isExcluded
      new Date(),
      new Date()
    );

    // Save the trophy profile using the repository
    await this.trophyProfileRepository.save(trophyProfile);

    this.logger.info('Trophy profile created successfully', {
      id: command.id.toString(),
      userId: command.userId,
      psnProfile: command.psnProfile
    });
  }
}