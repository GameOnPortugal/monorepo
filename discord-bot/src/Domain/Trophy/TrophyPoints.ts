/**
 * Rarity → TP ladder, copied verbatim (boundaries and order) from
 * `old-discord-bot/src/service/trophy/trophyManager.js#transformPercentageIntoPoints`:
 *
 * | Platinum rarity | TP   |
 * |------------------|------|
 * | > 30.01%         | 50   |
 * | > 15.01%         | 100  |
 * | > 8.01%          | 250  |
 * | > 5.01%          | 500  |
 * | > 2.01%          | 800  |
 * | > 0.6%           | 1250 |
 * | <= 0.6%          | 2000 |
 *
 * Pure function, no I/O — this is the whole reason it lives in the Domain
 * layer instead of next to the crawler.
 */
export function calculateTrophyPoints(percentage: number): number {
    if (percentage > 30.01) {
        return 50;
    }
    if (percentage > 15.01) {
        return 100;
    }
    if (percentage > 8.01) {
        return 250;
    }
    if (percentage > 5.01) {
        return 500;
    }
    if (percentage > 2.01) {
        return 800;
    }
    if (percentage > 0.6) {
        return 1250;
    }

    return 2000;
}
