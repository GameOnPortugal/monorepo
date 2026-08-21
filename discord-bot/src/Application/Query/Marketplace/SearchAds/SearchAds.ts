import type { AdSearchCriteria } from '../../../../Domain/Marketplace/AdSearchCriteria';

/** M5.9 — `/marketplace search` and its Prev/Next buttons. */
export class SearchAds {
    constructor(
        public readonly criteria: AdSearchCriteria,
        public readonly page: number = 1,
        public readonly pageSize: number = 10,
    ) {}
}
