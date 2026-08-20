/**
 * The self-service "Renovar"/`bump` cooldown (M5.6, plan 01's Limits
 * section: "bump allowed once per ad per 72h"). Not to be confused with the
 * unrelated 72h in `docs/plans/02-scheduler-and-lifecycle.md` — that one is
 * the response window after the *automatic* 14-day idle nudge (M6.5's
 * `pending_renewal` -> `active`/`expired` transition). Both happen to be 72h,
 * but they are different clocks gating different actions: this one is
 * "how often may an owner bump a still-active ad", not "how long does an
 * idle owner have to answer before their ad expires". Kept as its own
 * module, separate from any `AdLifecyclePolicy`, so the two are never
 * accidentally conflated or share a constant that later needs to diverge.
 */
export const AD_BUMP_COOLDOWN_HOURS = 72;

const MS_PER_HOUR = 60 * 60 * 1000;
export const AD_BUMP_COOLDOWN_MS = AD_BUMP_COOLDOWN_HOURS * MS_PER_HOUR;

/** The next moment `bumpedAt` would allow another bump, or `null` if it never has. */
export function nextBumpEligibleAt(bumpedAt: Date | null): Date | null {
    return bumpedAt === null ? null : new Date(bumpedAt.getTime() + AD_BUMP_COOLDOWN_MS);
}

/** Whether an ad last bumped at `bumpedAt` (or never) may be bumped again `now`. */
export function canBumpNow(bumpedAt: Date | null, now: Date): boolean {
    const eligibleAt = nextBumpEligibleAt(bumpedAt);
    return eligibleAt === null || eligibleAt.getTime() <= now.getTime();
}
