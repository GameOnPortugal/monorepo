import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { FindAdsDueForLifecycleAction } from './FindAdsDueForLifecycleAction';
import type { Ad } from '../../../../Domain/Marketplace/Ad.ts';
import type Logger from '../../../Logger/Logger';
import {
    AD_LIFECYCLE_IDLE_DAYS,
    subtractDays,
} from '../../../../Domain/Marketplace/AdLifecyclePolicy';

export interface AdLifecycleCandidates {
    /** Active, no postable message — expire directly, no DM (settled decision, plan 02). */
    orphaned: Ad[];
    /** Active and past its own `expires_at` — expire directly, no DM (the 30-day backstop). */
    pastExpiry: Ad[];
    /** Active, idle >= 14 days, has a message — send the renewal DM. */
    idle: Ad[];
    /** `pending_renewal`, 72h response window has passed — expire on silence. */
    awaitingExpiry: Ad[];
}

/**
 * The four queries overlap by construction — a long-dead orphaned row is
 * also past its expiry and also idle — so the buckets are narrowed to be
 * mutually exclusive before anyone acts on them, in the order the job wants
 * to treat them: expire-without-a-DM first, prompt-with-a-DM last.
 *
 * This is not cosmetic. Without it `AdsLifecycleJob` counts the same ad in
 * two buckets (inflating `considered` and burning two units of `workLimit`
 * on one row), and worse, DMs an owner "renew this within 72h" about an ad
 * the very same run has already expired.
 */
function excluding(ads: Ad[], taken: Set<string>): Ad[] {
    return ads.filter((ad) => !taken.has(ad.id.toString()));
}

function claim(ads: Ad[], taken: Set<string>): Ad[] {
    for (const ad of ads) {
        taken.add(ad.id.toString());
    }

    return ads;
}

@injectable()
export class FindAdsDueForLifecycleActionHandler {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    public async handle(query: FindAdsDueForLifecycleAction): Promise<AdLifecycleCandidates> {
        const idleBefore = subtractDays(query.now, AD_LIFECYCLE_IDLE_DAYS);

        const [orphanedRaw, pastExpiryRaw, idleRaw, awaitingExpiry] = await Promise.all([
            this.adRepository.findOrphanedActive(query.limitPerBucket),
            // The hard 30-day backstop (M6.9). Only reaches ads the DM path
            // never managed to settle — see AD_LIFECYCLE_MAX_AGE_DAYS.
            this.adRepository.findPastExpiry(query.now, query.limitPerBucket),
            this.adRepository.findIdleActive(idleBefore, query.limitPerBucket),
            // `expires_at` already holds each row's own absolute response
            // deadline (set by MarkAdPendingRenewalHandler as prompt-time +
            // 72h) — compare against `now` directly, see the repository
            // method's doc comment. `pending_renewal` rows are a disjoint
            // status from the three `active` queries above, so this bucket
            // needs no de-duplication.
            this.adRepository.findAwaitingResponse(query.now, query.limitPerBucket),
        ]);

        const taken = new Set<string>();
        const orphaned = claim(orphanedRaw, taken);
        const pastExpiry = claim(excluding(pastExpiryRaw, taken), taken);
        const idle = excluding(idleRaw, taken);

        this.logger.info('Found ads-lifecycle candidates', {
            orphaned: orphaned.length,
            pastExpiry: pastExpiry.length,
            idle: idle.length,
            awaitingExpiry: awaitingExpiry.length,
        });

        return { orphaned, pastExpiry, idle, awaitingExpiry };
    }
}
