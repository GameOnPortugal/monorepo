/**
 * M5.8 — the paginated counterpart to `ListUserAds` (which stays
 * unbounded/unpaginated on purpose: `MarketplaceAutocompleteHandler` and the
 * lifecycle jobs need every row, not a page of them). `/marketplace list`
 * and its Prev/Next buttons (`MarketplaceComponentHandler`'s `list-page`
 * action) are the only callers of this one.
 */
export class ListUserAdsPage {
    constructor(
        public readonly userId: string,
        public readonly page: number = 1,
        public readonly pageSize: number = 10,
    ) {}
}
