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
    /** Active, idle >= 14 days, has a message — send the renewal DM. */
    idle: Ad[];
    /** `pending_renewal`, 72h response window has passed — expire on silence. */
    awaitingExpiry: Ad[];
}

@injectable()
export class FindAdsDueForLifecycleActionHandler {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    public async handle(query: FindAdsDueForLifecycleAction): Promise<AdLifecycleCandidates> {
        const idleBefore = subtractDays(query.now, AD_LIFECYCLE_IDLE_DAYS);

        const [orphaned, idle, awaitingExpiry] = await Promise.all([
            this.adRepository.findOrphanedActive(query.limitPerBucket),
            this.adRepository.findIdleActive(idleBefore, query.limitPerBucket),
            // `expires_at` already holds each row's own absolute response
            // deadline (set by MarkAdPendingRenewalHandler as prompt-time +
            // 72h) — compare against `now` directly, see the repository
            // method's doc comment.
            this.adRepository.findAwaitingResponse(query.now, query.limitPerBucket),
        ]);

        this.logger.info('Found ads-lifecycle candidates', {
            orphaned: orphaned.length,
            idle: idle.length,
            awaitingExpiry: awaitingExpiry.length,
        });

        return { orphaned, idle, awaitingExpiry };
    }
}
