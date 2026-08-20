import { inject, injectable } from 'inversify';
import type { Job, JobContext, JobResult } from '../../../Domain/Job/Job.ts';
import type { Ad } from '../../../Domain/Marketplace/Ad.ts';
import type { GuildClient } from '../../../Domain/Community/GuildClient.ts';
import CommandHandlerManager from '../../CommandHandler/CommandHandlerManager.ts';
import { FindActiveAdsForReconcile } from '../../../Application/Query/Marketplace/FindActiveAdsForReconcile/FindActiveAdsForReconcile.ts';
import { ExpireAd } from '../../../Application/Write/Marketplace/ExpireAd/ExpireAd.ts';
import type Logger from '../../../Application/Logger/Logger.ts';
import { TYPES } from '../../DependencyInjection/types.ts';

interface ReconcileDetails {
    /** No message to check at all (the M0.1 empty-message_id shape) — never reported as vanished. */
    orphaned: number;
    /** Checked, and the message is still there. */
    alive: number;
    /** Checked, and the message is gone — moderator deletion or the orphan case from plan 01. */
    vanished: number;
}

/**
 * M6.6 — walks every `active` ad and, for the ones that have a real
 * message, confirms it still exists. Catches manual moderator deletions and
 * (defensively, in case `ads:lifecycle` hasn't reached it yet) the M0.1
 * orphan case.
 *
 * Deliberately checks each row's own stored `channel_id`
 * (`GuildClient.messageExists` takes a raw id) rather than a single fixed
 * channel — 62 of 70 production ads are in `#anuncios`, 5 in `#chat`, and 3
 * in a DM channel, and all of them need to be reconcilable.
 */
@injectable()
export class AdsReconcileJob implements Job {
    public readonly name = 'ads-reconcile';
    // Daily 03:00 — docs/plans/02-scheduler-and-lifecycle.md's job table.
    public readonly schedule = '0 3 * * *';

    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async run(context: JobContext): Promise<JobResult> {
        const ads: Ad[] = await this.commandHandlerManager.handle(
            new FindActiveAdsForReconcile(context.workLimit),
        );

        let considered = 0;
        let changed = 0;
        let skipped = 0;
        let failed = 0;
        const details: ReconcileDetails = { orphaned: 0, alive: 0, vanished: 0 };

        for (const ad of ads) {
            considered++;

            if (!ad.channelId || !ad.messageId) {
                // Nothing to check — count it separately, never as vanished
                // (settled decision, plan 02: these are not backfilled
                // heuristically; `ads:lifecycle` expires them directly).
                details.orphaned++;
                skipped++;
                continue;
            }

            let exists: boolean;
            try {
                exists = await this.guildClient.messageExists(ad.channelId, ad.messageId);
            } catch (error: any) {
                failed++;
                this.logger.error('ads-reconcile.check-failed', {
                    adId: ad.id.toString(),
                    channelId: ad.channelId,
                    messageId: ad.messageId,
                    error: error?.message ?? String(error),
                });
                continue;
            }

            if (exists) {
                details.alive++;
                skipped++;
                continue;
            }

            details.vanished++;

            if (context.dryRun) {
                changed++;
                continue;
            }

            try {
                await this.commandHandlerManager.handle(new ExpireAd(ad.id, 'message-vanished'));
                changed++;
            } catch (error: any) {
                failed++;
                this.logger.error('ads-reconcile.expire-failed', {
                    adId: ad.id.toString(),
                    error: error?.message ?? String(error),
                });
            }
        }

        return {
            considered,
            changed,
            skipped,
            failed,
            details: details as unknown as Record<string, unknown>,
        };
    }
}
