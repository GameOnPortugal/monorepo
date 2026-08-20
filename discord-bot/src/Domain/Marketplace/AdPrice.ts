/**
 * Parses the free-text `price` column into cents, mirroring the rule the
 * M5.3 migration used for its one-time backfill (`docs/plans/01-marketplace-overhaul.md`,
 * "price is validated (`^\d+([.,]\d{1,2})?\s*€?$`)"). `EditAd` (M5.6) is the
 * first *runtime* writer to keep `price_cents` in sync with `price` — the
 * create path (`SellSubcommand`/`CreateAd`) does not parse it yet, tracked
 * separately (not this milestone's scope).
 *
 * Returns `null` when the string does not match: NULL means "could not
 * parse", not "free", matching the migration's own rule — never guess.
 */
const PRICE_PATTERN = /^(\d+)([.,](\d{1,2}))?\s*€?$/;

export function parsePriceCents(price: string | null): number | null {
    if (price === null) {
        return null;
    }

    const match = PRICE_PATTERN.exec(price.trim());
    if (!match) {
        return null;
    }

    const wholePart = Number(match[1]);
    const fractionalRaw = match[3] ?? '';
    // Pad a single decimal digit ('5' -> '50') so "10.5€" is 1050 cents, not 1005.
    const fractionalCents = Number(fractionalRaw.padEnd(2, '0').slice(0, 2) || '0');

    return wholePart * 100 + fractionalCents;
}
