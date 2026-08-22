import { inject, injectable } from 'inversify';
import type { Job, JobContext, JobResult } from '../../../Domain/Job/Job.ts';
import type { DiscordProfileRepository } from '../../../Domain/Profile/DiscordProfileRepository.ts';
import CommandHandlerManager from '../../CommandHandler/CommandHandlerManager.ts';
import { SyncDiscordProfile } from '../../../Application/Write/Profile/SyncDiscordProfile/SyncDiscordProfile.ts';
import type { SyncDiscordProfileResult } from '../../../Application/Write/Profile/SyncDiscordProfile/SyncDiscordProfileHandler.ts';
import { TYPES } from '../../DependencyInjection/types.ts';
import type Logger from '../../../Application/Logger/Logger.ts';
import { sleep } from '../../../Application/Shared/sleep.ts';

/**
 * How old a cached profile may get before it is refetched. A week: a member
 * renaming or changing avatar is not urgent enough to justify hammering the
 * API, and at 109 distinct authors the whole population cycles through
 * comfortably inside that window at the default work limit.
 */
const DEFAULT_MAX_AGE_DAYS = 7;

/** Extra pacing on top of the REST client's own rate limiter — same reasoning as RelinkScreenshotsJob's. */
const DEFAULT_THROTTLE_MS = 150;

/**
 * M10.4 — keeps `discord_profiles` populated for everyone whose content the
 * portal publishes.
 *
 * The portal has never been able to credit a screenshot because
 * `screenshots.author_id` is a bare snowflake with nothing on the other side
 * of the join. This job is the other side: it walks the distinct author ids
 * across `screenshots` and `ads` (109 people behind 695 rows in production on
 * 2026-08-22) and writes a name and a re-hosted avatar for each.
 *
 * **The first run is the backfill.** There is no separate one-shot command,
 * because there is nothing one-shot about the work: `findStaleAuthorIds`
 * returns never-synced authors first, so the first few runs fill the table
 * and every run after that just refreshes whatever has gone stale. Running
 * it by hand (`bun run:command jobs:run discord-profiles-sync --limit=200`)
 * is the backfill, and it is safe to repeat.
 *
 * Scheduled daily rather than weekly even though rows are only stale after a
 * week: a daily pass with a bounded limit spreads the same work thinly
 * instead of doing all of it in one burst, and it means a newly-seen author
 * is credited within a day rather than within a week.
 */
@injectable()
export class DiscordProfilesSyncJob implements Job {
    public readonly name = 'discord-profiles-sync';
    // Daily 04:20 — between ads-reconcile (03:00) and anything else, so the
    // jobs in docs/plans/02-scheduler-and-lifecycle.md's table stay spread out.
    public readonly schedule = '20 4 * * *';

    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.DiscordProfileRepository)
        private readonly profileRepository: DiscordProfileRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
        private readonly maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
        private readonly throttleMs: number = DEFAULT_THROTTLE_MS,
    ) {}

    async run(context: JobContext): Promise<JobResult> {
        const staleBefore = new Date(Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000);
        const authorIds = await this.profileRepository.findStaleAuthorIds(
            staleBefore,
            context.workLimit,
        );

        if (authorIds.length === 0) {
            return { considered: 0, changed: 0, skipped: 0, failed: 0 };
        }

        if (context.dryRun) {
            this.logger.info('[dry-run] Would refresh Discord profiles', {
                count: authorIds.length,
            });
            return {
                considered: authorIds.length,
                changed: 0,
                skipped: authorIds.length,
                failed: 0,
                details: { dryRun: true },
            };
        }

        let changed = 0;
        let skipped = 0;
        let failed = 0;
        let avatarsRehosted = 0;

        for (const discordId of authorIds) {
            try {
                const result: SyncDiscordProfileResult = await this.commandHandlerManager.handle(
                    new SyncDiscordProfile(discordId),
                );

                if (result.profile === null) {
                    // A deleted Discord account — nothing to cache, and
                    // nothing wrong. Counted as skipped so a run reads
                    // honestly rather than as a partial failure.
                    skipped++;
                } else {
                    changed++;
                    if (result.avatarRehosted) avatarsRehosted++;
                }
            } catch (error: any) {
                // One member failing (rate limit, a transient 5xx, a refused
                // avatar) must not abandon the rest of the batch — the row
                // keeps its old `syncedAt`, so the next run retries it first.
                failed++;
                this.logger.error('Failed to sync a Discord profile', {
                    discordId,
                    error: error.message,
                });
            }

            await sleep(this.throttleMs);
        }

        return {
            considered: authorIds.length,
            changed,
            skipped,
            failed,
            details: { avatarsRehosted },
        };
    }
}
