import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { FindActiveAdsForReconcile } from './FindActiveAdsForReconcile';
import type { Ad } from '../../../../Domain/Marketplace/Ad.ts';
import type Logger from '../../../Logger/Logger';

@injectable()
export class FindActiveAdsForReconcileHandler {
    constructor(
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    public async handle(query: FindActiveAdsForReconcile): Promise<Ad[]> {
        const ads = await this.adRepository.findAllActive(query.limit);
        this.logger.info('Found active ads for reconcile', { count: ads.length });
        return ads;
    }
}
