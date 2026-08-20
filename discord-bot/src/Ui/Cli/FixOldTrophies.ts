import { inject, injectable } from 'inversify';
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand.ts';
import type { TrophyRepository } from '../../Domain/Trophy/TrophyRepository.ts';
import type { TrophySource } from '../../Domain/Trophy/TrophySource.ts';
import { TYPES } from '../../Infrastructure/DependencyInjection/types.ts';
import type Logger from '../../Application/Logger/Logger.ts';
import { Trophy } from '../../Domain/Trophy/Trophy.ts';

const DEFAULT_LIMIT = 100;

/**
 * `trophies:fix-old` (M7.7) — backfills `completionDate` for trophy rows
 * that have none, by re-fetching the trophy's page through `TrophySource`.
 *
 * Ported from `old-discord-bot/scripts/fix-old-trophies.js`, a one-off
 * script that re-scraped every `Trophies` row with a null `completionDate`.
 * Kept as a **manual console command, not a scheduled Job**: unlike
 * `trophies:sync` (M7.3), there is no ongoing reason for this data to go
 * stale — a trophy's `completionDate` is set once, at creation, by
 * `trophies:sync` itself (see `TrophiesSyncJob`), so null rows only exist
 * from historical causes (legacy data imported without one, or an earlier
 * bug). Once every existing null row is fixed, there is nothing left for a
 * recurring schedule to do — this is a backfill, not an operational job.
 * Also mirrors the old bot's own shape: it never ran on a schedule either.
 *
 * Idempotent: it only ever selects rows still missing a `completionDate`, so
 * a fixed row simply stops being selected on the next invocation — safe to
 * re-run after a partial failure. Bounded via `--limit=N` (default 100) so
 * a single run has a predictable, small footprint against PSNProfiles
 * (`TrophySource`'s throttle/backoff apply exactly as they do for
 * `trophies:sync`; nothing extra is added here).
 *
 * Usage (via `bun run:command`, see package.json):
 *   bun run:command trophies:fix-old [--dry-run] [--limit=N]
 */
@injectable()
export default class FixOldTrophies implements ConsoleCommand {
    public static commandName = 'trophies:fix-old';

    constructor(
        @inject(TYPES.TrophyRepository) private readonly trophyRepository: TrophyRepository,
        @inject(TYPES.TrophySource) private readonly trophySource: TrophySource,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    configureArgs(_inputArgs: unknown): void {}

    public async run(inputArgs: unknown): Promise<number> {
        const args: string[] = Array.isArray(inputArgs) ? inputArgs.map(String) : [];
        const dryRun = args.includes('--dry-run');
        const limitFlag = args.find((arg) => arg.startsWith('--limit='));
        const limit = limitFlag ? Number(limitFlag.split('=')[1]) : DEFAULT_LIMIT;

        const trophies = await this.trophyRepository.findMissingCompletionDate(limit);
        this.logger.info('trophies:fix-old.start', { count: trophies.length, dryRun, limit });

        let fixed = 0;
        let failed = 0;

        for (const trophy of trophies) {
            if (!trophy.url) {
                failed++;
                this.logger.warn('trophies:fix-old.skip-no-url', { id: trophy.id.toString() });
                continue;
            }

            try {
                const data = await this.trophySource.getPlatinumTrophyData(trophy.url);

                if (!dryRun) {
                    await this.trophyRepository.save(
                        new Trophy(
                            trophy.id,
                            trophy.trophyProfile,
                            trophy.url,
                            trophy.points,
                            data.completionDate,
                            trophy.createdAt,
                            new Date(),
                        ),
                    );
                }

                fixed++;
                this.logger.info('trophies:fix-old.fixed', {
                    id: trophy.id.toString(),
                    url: trophy.url,
                    completionDate: data.completionDate,
                    dryRun,
                });
            } catch (error) {
                failed++;
                this.logger.error('trophies:fix-old.failed', {
                    id: trophy.id.toString(),
                    url: trophy.url,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.logger.info('trophies:fix-old.finish', { fixed, failed, dryRun });

        return failed > 0 ? 1 : 0;
    }
}
