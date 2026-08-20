// Shared limit/offset parsing, clamped so a bad or hostile query string can't
// force an unbounded scan.
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

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
