import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { MarkAdPendingRenewal } from './MarkAdPendingRenewal';
import { AdStatus } from '../../../../Domain/Marketplace/AdStatus';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';

@injectable()
export class MarkAdPendingRenewalHandler implements CommandHandler<MarkAdPendingRenewal> {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: MarkAdPendingRenewal): Promise<void> {
        const ad = await this.adRepository.get(command.id);

        // Idempotent, and defensive against a race with a manual action
        // (e.g. the owner deleted the ad between the query and this write):
        // only ads still `active` can move to `pending_renewal`.
        if (!ad.status.equals(AdStatus.active())) {
            this.logger.info('Ad no longer active — skipping pending-renewal mark', {
                id: command.id.toString(),
                status: ad.status.toString(),
            });
            return;
        }

        await this.adRepository.save(
            ad.withChanges({ status: AdStatus.pendingRenewal(), expiresAt: command.respondBy }),
        );

        this.logger.info('Ad marked pending renewal', {
            id: command.id.toString(),
            authorId: ad.authorId,
            respondBy: command.respondBy,
        });
    }
}
