import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import type { AdPage } from '../../../../Domain/Marketplace/AdPage';
import { SearchAds } from './SearchAds';
import type Logger from '../../../Logger/Logger';

/** Same clamp-then-fetch shape as `ListUserAdsPageHandler`/trophies' `GetRankHandler` — see either for why. */
@injectable()
export class SearchAdsHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
    ) {}

    public async handle(query: SearchAds): Promise<AdPage> {
        this.logger.info('Handling SearchAds query', {
            criteria: query.criteria,
            page: query.page,
            pageSize: query.pageSize,
        });

        const pageSize = Math.max(1, Math.trunc(query.pageSize));
        const totalCount = await this.adRepository.countSearch(query.criteria);
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const page = Math.min(Math.max(1, Math.trunc(query.page)), totalPages);
        const offset = (page - 1) * pageSize;

        const data = await this.adRepository.search(query.criteria, {
            limit: pageSize,
            offset,
        });

        return { data, page, pageSize, totalPages, totalCount };
    }
}
