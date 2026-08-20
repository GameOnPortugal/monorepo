import { inject, injectable } from 'inversify';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type { AdRepository } from '../../../../Domain/Marketplace/AdRepository';
import type { AdPage } from '../../../../Domain/Marketplace/AdPage';
import { ListUserAdsPage } from './ListUserAdsPage';
import type Logger from '../../../Logger/Logger';

/**
 * Same clamp-then-fetch shape as trophies' `GetRankHandler` (M7.6): the
 * requested page is never trusted as in-range — it can arrive decoded
 * straight off a pagination button clicked against a list that has since
 * shrunk (an ad sold, expired or was deleted between page loads) — so
 * clamping happens once, here, and every caller can render whatever page
 * comes back without its own bounds check.
 */
@injectable()
export class ListUserAdsPageHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository,
    ) {}

    public async handle(query: ListUserAdsPage): Promise<AdPage> {
        this.logger.info('Handling ListUserAdsPage query', {
            userId: query.userId,
            page: query.page,
            pageSize: query.pageSize,
        });

        const pageSize = Math.max(1, Math.trunc(query.pageSize));
        const totalCount = await this.adRepository.countByUserId(query.userId);
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const page = Math.min(Math.max(1, Math.trunc(query.page)), totalPages);
        const offset = (page - 1) * pageSize;

        const data = await this.adRepository.findByUserId(query.userId, {
            limit: pageSize,
            offset,
        });

        return { data, page, pageSize, totalPages, totalCount };
    }
}
