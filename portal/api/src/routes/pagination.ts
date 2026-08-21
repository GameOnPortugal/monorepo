// Shared limit/offset parsing, clamped so a bad or hostile query string can't
// force an unbounded scan.
export const DEFAULT_LIMIT = 20;
// Raised from 100 (M8.3's original clamp) for M8.8: the screenshots gallery
// fetches the (currently 624-row, capped well below this) full public set in
// one call and paginates/filters client-side, rather than doing normalised
// platform filtering server-side (M8.4's mapping lives in portal/web only —
// see docs/plans/GLOBAL-PLAN.md M8.4 row). Still a bounded constant, not
// "no limit": at 10x today's screenshot count this remains a small response.
export const MAX_LIMIT = 1000;

export function parsePagination(query: { limit?: string; offset?: string }): {
  limit: number;
  offset: number;
} {
  const limit = clamp(parseInt(query.limit ?? "", 10), 1, MAX_LIMIT, DEFAULT_LIMIT);
  const offset = clamp(parseInt(query.offset ?? "", 10), 0, Number.MAX_SAFE_INTEGER, 0);
  return { limit, offset };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
