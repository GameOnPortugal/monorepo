/**
 * A single button on a direct message (M6.5). `customId` is the only thing
 * that survives the round-trip to Discord and back on click — see
 * `AdsLifecycleJob.ts` for the `mkt:renew:<adId>` scheme this bot uses, and
 * why the eventual click handler (M4.7, not built by this PR) must never
 * trust it as authorization, only as a lookup key.
 */
export interface DirectMessageButton {
    customId: string;
    label: string;
}

export interface DirectMessagePayload {
    content: string;
    /** Discord caps this at 25 (5 rows x 5), chunked into rows by the adapter. */
    buttons?: DirectMessageButton[];
}
