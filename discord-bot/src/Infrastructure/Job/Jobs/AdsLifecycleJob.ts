import { inject, injectable } from 'inversify';
import type { Job, JobContext, JobResult } from '../../../Domain/Job/Job.ts';
import type { Ad } from '../../../Domain/Marketplace/Ad.ts';
import {
    AD_LIFECYCLE_RESPONSE_HOURS,
    addHours,
} from '../../../Domain/Marketplace/AdLifecyclePolicy.ts';
import type { GuildClient } from '../../../Domain/Community/GuildClient.ts';
import type {
    DirectMessageButton,
    DirectMessagePayload,
} from '../../../Domain/Community/DirectMessage.ts';
import CommandHandlerManager from '../../CommandHandler/CommandHandlerManager.ts';
import { FindAdsDueForLifecycleAction } from '../../../Application/Query/Marketplace/FindAdsDueForLifecycleAction/FindAdsDueForLifecycleAction.ts';
import type { AdLifecycleCandidates } from '../../../Application/Query/Marketplace/FindAdsDueForLifecycleAction/FindAdsDueForLifecycleActionHandler.ts';
import { ExpireAd } from '../../../Application/Write/Marketplace/ExpireAd/ExpireAd.ts';
import { MarkAdPendingRenewal } from '../../../Application/Write/Marketplace/MarkAdPendingRenewal/MarkAdPendingRenewal.ts';
import type Logger from '../../../Application/Logger/Logger.ts';
import { TYPES } from '../../DependencyInjection/types.ts';

/**
 * M6.5 — the guard against the "first-run mass-expiry problem" documented in
 * the PR body: M5.3's backfill gave all 70 production ads an `expires_at`
 * and every one of them is, by `bumped_at ?? createdAt`, already idle more
 * than 14 days (the newest is from 2026-08-06). Without a cap, the very
 * first scheduled run would DM every distinct author in one go — a wall of
 * unsolicited DMs about ads some of them posted in 2024, which is exactly
 * the kind of thing that gets a bot muted.
 *
 * This caps how many **distinct recipients** get a *new* prompt in a single
 * run — independent of, and much smaller than, `context.workLimit` (which
 * bounds total items touched, including expiries). Ads beyond the cap are
 * left untouched (counted as `skipped`, not `failed` — they are exactly
 * where they were, just not reached yet) and are picked up on a later run:
 * at one run/day (see `schedule` below) and a backlog of however many
 * distinct authors actually need prompting, the whole backlog clears within
 * a few days instead of landing in one DM storm. Combined with the orphaned
 * rows (28 of the 70) being expired directly with no DM at all, the
 * realistic first-week impact is a handful of DMs a day, not seventy at
 * once.
 *
 * Operators: run `bun run:command jobs:run ads-lifecycle --dry-run` first
 * and read the reported counts/details before ever letting this run for
 * real — see the PR body for the full first-run runbook.
 */
const MAX_NEW_PROMPT_RECIPIENTS_PER_RUN = 5;

interface LifecycleDetails {
    expiredOrphaned: number;
    expiredNoResponse: number;
    prompted: number;
    recipientsDmed: number;
    recipientsDmClosed: number;
    recipientsSkippedGrace: number;
}

function truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

/**
 * pt-PT copy (cross-cutting rule 1) for the renewal DM. One message per
 * author listing *every* one of their idle ads — never one DM per ad (that
 * was the old bot's recursive-DM behaviour this deliberately replaces).
 */
function buildRenewalPrompt(ads: Ad[]): DirectMessagePayload {
    const lines = ads.map(
        (ad) => `• **${ad.name ?? 'Anúncio sem nome'}** — ${ad.price ?? 'sem preço'}`,
    );

    const content = [
        'Olá! 👋',
        '',
        ads.length === 1
            ? 'Tens este anúncio no mercado parado há mais de 14 dias sem novidades:'
            : 'Tens estes anúncios no mercado parados há mais de 14 dias sem novidades:',
        '',
        ...lines,
        '',
        'Se ainda estão disponíveis, carrega em "Renovar" para os manteres visíveis. ' +
            `Se não fizeres nada, o(s) anúncio(s) passa(m) a **expirado(s)** dentro de ${AD_LIFECYCLE_RESPONSE_HOURS} horas — ` +
            'não são apagados, podes sempre repô-los mais tarde.',
    ].join('\n');

    // customId scheme: `mkt:renew:<adId>`. M4.7 (component routing) does not
    // exist yet in this codebase, so clicking this button today does
    // nothing — the click handler still has to be built and wired in
    // inversify.config.ts. When it is, it MUST re-check ownership itself
    // from the ad row's own authorId (RenewAdHandler already does this) —
    // never trust the user id embedded in, or inferred from, the customId
    // or the interaction's channel; the customId is only a lookup key.
    const buttons: DirectMessageButton[] = ads.map((ad) => ({
        customId: `mkt:renew:${ad.id.toString()}`,
        label: truncate(`Renovar: ${ad.name ?? ad.id.toString()}`, 80),
    }));

    return { content, buttons };
}

@injectable()
export class AdsLifecycleJob implements Job {
    public readonly name = 'ads-lifecycle';
    // Daily 10:00 — docs/plans/02-scheduler-and-lifecycle.md's job table.
    public readonly schedule = '0 10 * * *';

    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async run(context: JobContext): Promise<JobResult> {
        const now = new Date();

        const candidates: AdLifecycleCandidates = await this.commandHandlerManager.handle(
            new FindAdsDueForLifecycleAction(now, context.workLimit),
        );

        let considered = 0;
        let changed = 0;
        let skipped = 0;
        let failed = 0;
        let remainingBudget = context.workLimit;

        const details: LifecycleDetails = {
            expiredOrphaned: 0,
            expiredNoResponse: 0,
            prompted: 0,
            recipientsDmed: 0,
            recipientsDmClosed: 0,
            recipientsSkippedGrace: 0,
        };

        const expireOne = async (
            ad: Ad,
            reason: 'orphaned-no-message' | 'no-response',
            detailKey: 'expiredOrphaned' | 'expiredNoResponse',
        ): Promise<void> => {
            considered++;

            if (remainingBudget <= 0) {
                skipped++;
                return;
            }
            remainingBudget--;

            if (context.dryRun) {
                changed++;
                details[detailKey]++;
                return;
            }

            try {
                await this.commandHandlerManager.handle(new ExpireAd(ad.id, reason));
                changed++;
                details[detailKey]++;
            } catch (error: any) {
                failed++;
                this.logger.error('ads-lifecycle.expire.failed', {
                    adId: ad.id.toString(),
                    reason,
                    error: error?.message ?? String(error),
                });
            }
        };

        for (const ad of candidates.orphaned) {
            await expireOne(ad, 'orphaned-no-message', 'expiredOrphaned');
        }
        for (const ad of candidates.awaitingExpiry) {
            await expireOne(ad, 'no-response', 'expiredNoResponse');
        }

        // Group the idle bucket by author — the whole point of M6.5's
        // redesign is one DM per user, not one per ad.
        const byAuthor = new Map<string, Ad[]>();
        for (const ad of candidates.idle) {
            if (!ad.authorId) {
                // Shouldn't happen (findIdleActive only returns rows with a
                // real message, which implies a real author historically),
                // but an ad this defensive query somehow returns with no
                // author can't be DM'd — count it, don't crash the run.
                considered++;
                skipped++;
                this.logger.warn('ads-lifecycle.idle-ad-missing-author', {
                    adId: ad.id.toString(),
                });
                continue;
            }

            const group = byAuthor.get(ad.authorId) ?? [];
            group.push(ad);
            byAuthor.set(ad.authorId, group);
        }

        let recipientsThisRun = 0;

        for (const [authorId, ads] of byAuthor) {
            if (remainingBudget <= 0) {
                considered += ads.length;
                skipped += ads.length;
                continue;
            }

            if (recipientsThisRun >= MAX_NEW_PROMPT_RECIPIENTS_PER_RUN) {
                considered += ads.length;
                skipped += ads.length;
                details.recipientsSkippedGrace++;
                continue;
            }

            considered += ads.length;
            remainingBudget -= ads.length;
            recipientsThisRun++;

            if (context.dryRun) {
                changed += ads.length;
                details.prompted += ads.length;
                continue;
            }

            let dmMessageId: string | null;
            try {
                dmMessageId = await this.guildClient.sendDirectMessage(
                    authorId,
                    buildRenewalPrompt(ads),
                );
            } catch (error: any) {
                failed += ads.length;
                this.logger.error('ads-lifecycle.dm-send-threw', {
                    authorId,
                    adIds: ads.map((ad) => ad.id.toString()),
                    error: error?.message ?? String(error),
                });
                continue;
            }

            if (dmMessageId === null) {
                // A closed DM is not grounds for expiring anything early —
                // log it, count it, carry on (M6.5 non-negotiable).
                details.recipientsDmClosed++;
                skipped += ads.length;
                this.logger.warn('ads-lifecycle.dm-closed', {
                    authorId,
                    adIds: ads.map((ad) => ad.id.toString()),
                });
                continue;
            }

            details.recipientsDmed++;
            const respondBy = addHours(now, AD_LIFECYCLE_RESPONSE_HOURS);

            for (const ad of ads) {
                try {
                    await this.commandHandlerManager.handle(
                        new MarkAdPendingRenewal(ad.id, respondBy),
                    );
                    changed++;
                    details.prompted++;
                } catch (error: any) {
                    failed++;
                    this.logger.error('ads-lifecycle.mark-prompted.failed', {
                        adId: ad.id.toString(),
                        error: error?.message ?? String(error),
                    });
                }
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
