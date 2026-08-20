import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { CountActiveAds } from './CountActiveAds';

@injectable()
export class CountActiveAdsHandler {
    constructor(@inject(TYPES.AdRepository) private readonly adRepository: AdRepository) {}

    public async handle(query: CountActiveAds): Promise<number> {
        return this.adRepository.countActiveByUserId(query.userId);
    }
}
