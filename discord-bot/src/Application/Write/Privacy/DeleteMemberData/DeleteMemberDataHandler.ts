import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { DeleteMemberData } from './DeleteMemberData';
import type { DeleteMemberDataResult } from './DeleteMemberDataResult';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import type { ScreenshotRepository } from '../../../../Domain/Screenshot/ScreenshotRepository';
import type { TrophyProfileRepository } from '../../../../Domain/Trophy/TrophyProfileRepository';
import type { TrophyRepository } from '../../../../Domain/Trophy/TrophyRepository';
import type { PrivacyRepository } from '../../../../Domain/Privacy/PrivacyRepository';
import type { DiscordProfileRepository } from '../../../../Domain/Profile/DiscordProfileRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';

/**
 * GDPR erasure (M9.7) — this is the only place in the codebase that hard
 * -deletes a member's content rather than hiding it. `SetPrivacyOptOutHandler`
 * (the reversible `/privacidade sair` path) never reaches here; this is the
 * conservative default for the irreversible "forget me" request the privacy
 * page describes, chosen because GDPR's right to erasure does not admit a
 * grace period as a compliant default — see docs/plans/GLOBAL-PLAN.md M9.7
 * for why an actual grace/undo window was left as an open question for Luis
 * rather than built.
 *
 * Ads and screenshots are hard-deleted outright (`deleteAllByAuthor` bypasses
 * ads' normal soft-delete). The trophy profile's child `Trophies` rows are
 * deleted first — the schema has no `onDelete: Cascade` on that relation, so
 * deleting the profile first would just throw a foreign-key error.
 *
 * `screenshot_winners` rows are deliberately **not** deleted: erasing the
 * member's screenshots already removes everything the Hall of Fame could
 * display for them, and the surviving row records only that a contest week
 * had a winner. Rewriting the contest's history to say a week never happened
 * is not what erasure asks for.
 */
@injectable()
export class DeleteMemberDataHandler implements CommandHandler<DeleteMemberData> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.ScreenshotRepository)
        private readonly screenshotRepository: ScreenshotRepository,
        @inject(TYPES.TrophyProfileRepository)
        private readonly trophyProfileRepository: TrophyProfileRepository,
        @inject(TYPES.TrophyRepository) private readonly trophyRepository: TrophyRepository,
        @inject(TYPES.PrivacyRepository) private readonly privacyRepository: PrivacyRepository,
        @inject(TYPES.DiscordProfileRepository)
        private readonly discordProfileRepository: DiscordProfileRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: DeleteMemberData): Promise<DeleteMemberDataResult> {
        const { discordId } = command;

        const adsDeleted = await this.adRepository.deleteAllByAuthor(discordId);
        const screenshotsDeleted = await this.screenshotRepository.deleteAllByAuthor(discordId);

        let trophiesDeleted = 0;
        let trophyProfileDeleted = false;
        const trophyProfile = await this.trophyProfileRepository.findByUserId(discordId);
        if (trophyProfile !== null) {
            const trophies = await this.trophyRepository.findByProfile(trophyProfile.id.toString());
            for (const trophy of trophies) {
                await this.trophyRepository.delete(trophy.id);
            }
            trophiesDeleted = trophies.length;

            await this.trophyProfileRepository.delete(trophyProfile.id);
            trophyProfileDeleted = true;
        }

        // M10.4 — the cached copy of their name and avatar goes too. An
        // erasure request that left a `discord_profiles` row behind would
        // keep exactly the personal data it was asked to remove.
        //
        // The re-hosted avatar *object* in MediaStorage is not removed here.
        // That matches what `deleteAllByAuthor` above already does with
        // screenshot images — this handler has never deleted stored media,
        // only rows — so a media sweep is one follow-up covering both, not
        // something to half-do for avatars alone. The object is keyed by
        // Discord's avatar hash, so it is not reachable from the member's id
        // once the row naming it is gone.
        await this.discordProfileRepository.delete(discordId);

        // Nothing left to protect — remove the opt-out row too, if any.
        await this.privacyRepository.delete(discordId);

        this.logger.info('Member data erased (GDPR request)', {
            discordId,
            adsDeleted,
            screenshotsDeleted,
            trophiesDeleted,
            trophyProfileDeleted,
        });

        return { adsDeleted, screenshotsDeleted, trophiesDeleted, trophyProfileDeleted };
    }
}
