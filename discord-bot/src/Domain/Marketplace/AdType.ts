/**
 * `adType` has carried three string values for two concepts
 * (docs/known-issues.md #22): `'sell'` (35 rows, the old bot, Nov 2024 – Apr
 * 2025) and `'sale'` (28 rows — every ad the *current* bot has ever created,
 * May 2025 onward, because `SellSubcommand` hardcodes `'sale'`) both mean
 * "I'm selling this"; `'wanted'` (7 rows) is the other concept.
 *
 * The M5.3 migration backfills the 28 historical `'sale'` rows to `'sell'`.
 * That alone is not enough — `SellSubcommand` would keep writing `'sale'` on
 * the very next `/marketplace sell` and the drift would reappear. Rather than
 * touch `Infrastructure/Bot` (owned by a parallel PR), the fix lives here, at
 * the one place every `Ad` is constructed: normalise on the way in, so no
 * caller — today's `SellSubcommand`, a future one, or a test — can write
 * `'sale'` again.
 */
export function normalizeAdType(adType: string | null): string | null {
    return adType === 'sale' ? 'sell' : adType;
}
