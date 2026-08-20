/**
 * M6.5 — asks "what does `ads:lifecycle` need to act on right now?" as of
 * `now`, capped at `limitPerBucket` rows per category so a single query
 * cannot return more than a job's work limit could ever process.
 */
export class FindAdsDueForLifecycleAction {
    constructor(
        public readonly now: Date,
        public readonly limitPerBucket: number,
    ) {}
}
