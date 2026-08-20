/** M5.10 — backs the 10-active-ads-per-user limit check in `SellSubcommand`/`WantedSubcommand`. */
export class CountActiveAds {
    constructor(public readonly userId: string) {}
}
