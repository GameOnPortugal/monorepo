import type {
    PlatinumTrophyData,
    TrophyProfileRank,
    TrophySource,
} from '../../src/Domain/Trophy/TrophySource';

/**
 * Hand-rolled fake `TrophySource` — no mocking library, no network, ever.
 * Shared by every test that needs a profile's rank, trophy pages or a
 * single trophy's data without touching PSNProfiles: `CheckTrophyProfileSubcommand`
 * (M7.4, live rank), `TrophiesSyncJob` (M7.3) and `FixOldTrophies` (M7.7).
 *
 * Defaults are deliberately "everything is fine" (a real rank, empty trophy
 * pages) so a test only has to configure the parts it cares about.
 */
export default class FakeTrophySource implements TrophySource {
    public readonly rankRequests: string[] = [];
    public readonly trophyListRequests: Array<{ psnProfile: string; page: number }> = [];
    public readonly trophyDataRequests: string[] = [];

    private ranks = new Map<string, TrophyProfileRank>();
    /** psnProfile -> pages, 0-indexed array position = page 1. */
    private trophyPages = new Map<string, string[][]>();
    private trophyData = new Map<string, PlatinumTrophyData>();
    private trophyDataErrors = new Map<string, Error>();
    private rankErrors = new Map<string, Error>();

    setRank(psnProfile: string, rank: TrophyProfileRank): void {
        this.ranks.set(psnProfile, rank);
    }

    /** Marks a profile as having no visible rank — PSNProfiles' "banned/deleted" signal. */
    setNoRank(psnProfile: string): void {
        this.ranks.set(psnProfile, { worldRank: null, countryRank: null });
    }

    /** The next (and every subsequent) getProfileRank(psnProfile) call throws this. */
    failRankWith(psnProfile: string, error: Error): void {
        this.rankErrors.set(psnProfile, error);
    }

    setTrophyPages(psnProfile: string, pages: string[][]): void {
        this.trophyPages.set(psnProfile, pages);
    }

    setTrophyData(url: string, data: PlatinumTrophyData): void {
        this.trophyData.set(url, data);
    }

    failTrophyDataWith(url: string, error: Error): void {
        this.trophyDataErrors.set(url, error);
    }

    async getProfileRank(psnProfile: string): Promise<TrophyProfileRank> {
        this.rankRequests.push(psnProfile);
        const error = this.rankErrors.get(psnProfile);
        if (error) {
            throw error;
        }
        return this.ranks.get(psnProfile) ?? { worldRank: 1000, countryRank: 100 };
    }

    async getProfileTrophies(psnProfile: string, page: number = 1): Promise<string[]> {
        this.trophyListRequests.push({ psnProfile, page });
        const pages = this.trophyPages.get(psnProfile) ?? [];
        return pages[page - 1] ?? [];
    }

    async getPlatinumTrophyData(trophyUrl: string): Promise<PlatinumTrophyData> {
        this.trophyDataRequests.push(trophyUrl);

        const error = this.trophyDataErrors.get(trophyUrl);
        if (error) {
            throw error;
        }

        const data = this.trophyData.get(trophyUrl);
        if (!data) {
            throw new Error(`FakeTrophySource: no trophy data registered for ${trophyUrl}`);
        }

        return data;
    }
}
