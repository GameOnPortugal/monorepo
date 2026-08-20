import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import { GetAd } from './GetAd';
import type Logger from '../../../Logger/Logger';
import type { Ad } from '../../../../Domain/Marketplace/Ad.ts';

@injectable()
export class GetAdHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
    ) {}

    /**
     * @throws RecordNotFound
     */
    public async handle(query: GetAd): Promise<Ad> {
        this.logger.info('Handling GetAd query', { id: query.id.toString() });
        return await this.adRepository.get(query.id);
    }
}
