/** Row counts actually removed — surfaced to the member in the confirmation reply. */
export interface DeleteMemberDataResult {
    adsDeleted: number;
    screenshotsDeleted: number;
    trophiesDeleted: number;
    trophyProfileDeleted: boolean;
}
