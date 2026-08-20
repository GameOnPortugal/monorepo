// Shared "is this row allowed to appear in a public response" predicates.
//
// docs/plans/03-portal.md decision 5 / GLOBAL-PLAN M9.7: a `public_opt_out`
// boolean is planned for `ads`, `screenshots` and `trophyprofiles`, honoured
// by both the bot and the portal. It does not exist in the schema yet — this
// PR only scaffolds the read paths, it does not add the column (that is bot
// schema work, out of scope here and explicitly not to be touched by this
// agent).
//
// What *is* in scope: making sure that when M9.7 lands, honouring the flag is
// a one-line addition to the three functions below, not a rewrite of every
// route. Every repository query in this directory must build its `where`
// through these functions rather than inlining status/exclusion filters.

// `any` rather than Prisma's generated `AdWhereInput` etc.: these helpers are
// deliberately generic over whichever model calls them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

/** Ads visible on the public marketplace pages. */
export function publicAdsWhere(extra: Where = {}): Where {
  return {
    ...extra,
    status: extra.status ?? "active",
    // TODO(M9.7): AND public_opt_out = false, once the column exists.
  };
}

/** Screenshots visible in the public gallery. */
export function publicScreenshotsWhere(extra: Where = {}): Where {
  return {
    ...extra,
    // TODO(M9.7): AND public_opt_out = false, once the column exists.
  };
}

/**
 * The trophy leaderboard already excludes banned/left/excluded profiles via
 * `isExcluded` (see OrmTrophyRepository.queryRankedHunters in the bot — that
 * flag is kept as the single source of truth by TrophiesSyncJob, which always
 * sets isExcluded alongside isBanned/hasLeft). `public_opt_out` will be a
 * second, independent flag for "don't show me publicly even though I'm a
 * legitimate ranked player" — AND it in here once it exists.
 */
export function publicTrophyProfileFilter(): string {
  return "tp.isExcluded = false";
  // TODO(M9.7): "tp.isExcluded = false AND tp.public_opt_out = false"
}
