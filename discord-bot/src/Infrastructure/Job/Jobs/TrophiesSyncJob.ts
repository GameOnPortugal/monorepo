import { inject, injectable } from 'inversify';
import type { Job, JobContext, JobResult } from '../../../Domain/Job/Job.ts';
import type { TrophyProfileRepository } from '../../../Domain/Trophy/TrophyProfileRepository.ts';
import type { TrophyRepository } from '../../../Domain/Trophy/TrophyRepository.ts';
import type { TrophySource } from '../../../Domain/Trophy/TrophySource.ts';
import { TrophyProfile } from '../../../Domain/Trophy/TrophyProfile.ts';
import { TrophyAlreadyClaimed } from '../../../Domain/Trophy/TrophyAlreadyClaimed.ts';
import { TrophyNotEarnedYet } from '../../../Domain/Trophy/TrophyNotEarnedYet.ts';
import { calculateTrophyPoints } from '../../../Domain/Trophy/TrophyPoints.ts';
import type { GuildClient } from '../../../Domain/Community/GuildClient.ts';
import { CommunityChannels } from '../../../Domain/Community/CommunityChannels.ts';
import { TYPES } from '../../DependencyInjection/types.ts';
import type Logger from '../../../Application/Logger/Logger.ts';

interface FlaggedProfile {
    psnProfile: string;
    flag: string;
}

interface FailedProfile {
    psnProfile: string;
    reason: string;
}

/**
 * A profile this run has decided *would* be auto-moderated, not yet
 * written. Deferred so the whole batch's size can be checked against
 * `MODERATION_SAFETY_VALVE_THRESHOLD` before any of it is committed — see
 * `resolveFlags`.
 */
interface PendingFlag {
    profile: TrophyProfile;
    psnProfile: string;
    flags: { isBanned?: boolean; hasLeft?: boolean; isExcluded?: boolean };
    reason: string;
}

/** Per-profile trophy-walk outcome, folded into the job-wide JobResult by run(). */
interface ProfileOutcome {
    changed: number;
    skipped: number;
    failed: number;
}

/**
 * A single run flagging more than this many profiles is treated as evidence
 * the PSNProfiles parser broke, not that the community mass-quit — see
 * `resolveFlags`. Picked as: a legitimate mass departure of more than a
 * handful of the ~118 tracked members inside one 10-minute window is
 * implausible for a small community, whereas a markup change breaking
 * `getProfileRank`'s regex would flag most/all non-excluded profiles at
 * once. 10 sits comfortably above ordinary single-digit background churn (a
 * member or two going private, or actually leaving, between runs is
 * expected and fine) and comfortably below what a systemic parser failure
 * would produce.
 */
const MODERATION_SAFETY_VALVE_THRESHOLD = 10;

/**
 * A single profile's newest-first walk that creates more new trophies than
 * this in one run gets **one** summary announcement instead of one message
 * per trophy — see "Announcements, and their flood guard" below. 3 is
 * deliberately small: the steady-state case (a profile that already synced
 * last run) earns 0 or 1 new platinum between 10-minute runs, so anything
 * past a handful in a single run is itself a sign this is a backlog
 * (first-ever sync, or a profile that reconnected after a long gap), not
 * routine activity — exactly the case that must not become a wall of
 * individual messages.
 */
const TROPHIES_ANNOUNCE_BATCH_THRESHOLD = 3;

/**
 * Hard ceiling on how many announcement messages (individual or summary)
 * `trophies:sync` will post to the trophies channel in a single run,
 * regardless of how many profiles changed. The per-profile batching above
 * guards one profile's backlog; this guards the multi-profile case — e.g. an
 * operator flipping `TROPHIES_ANNOUNCE_ENABLED` on for the first time after
 * profiles have been quietly accumulating trophies while it was off. Once
 * spent, further trophies still get created and counted in `changed` as
 * normal — only the announcement is skipped, and it's skipped loudly
 * (`trophies:sync.announce.suppressed`, folded into `JobResult.details`),
 * never silently.
 */
const TROPHIES_ANNOUNCE_MAX_MESSAGES_PER_RUN = 10;

/** Tracks how much "work" (network calls) this run has spent, across all profiles. */
class Budget {
    used = 0;

    constructor(private readonly limit: number) {}

    has(): boolean {
        return this.used < this.limit;
    }

    spend(): void {
        this.used++;
    }
}

/** Tracks how many announcement messages this run has sent, across all profiles. */
class AnnouncementBudget {
    used = 0;
    suppressed = 0;

    constructor(private readonly limit: number) {}

    hasCapacity(): boolean {
        return this.used < this.limit;
    }

    spend(): void {
        this.used++;
    }

    suppress(): void {
        this.suppressed++;
    }
}

/** One newly-created trophy, queued up for an announcement once its profile's walk finishes. */
interface NewTrophyAnnouncement {
    userId: string;
    url: string;
    points: number;
}

/**
 * `trophies:sync` (M7.3) — the data-producing side of `/trophy rank`, which
 * until this job existed could only ever report data imported from the
 * legacy DB (frozen since 2024-12-02, see GLOBAL-PLAN M7's intro).
 *
 * Ported from `old-discord-bot/scripts/parse-psn-profile.js`, previously run
 * every 10 minutes by the deleted `scheduler/` container
 * (`old-discord-bot`'s `scheduler/config.ini` had it commented out — this is
 * the first time it has run at all in this rewrite). Registered with the
 * same 10-minute cadence in `inversify.config.ts`, but — see "Scheduling is
 * opt-in" below — only actually scheduled once an operator has reviewed a
 * dry run and turned it on.
 *
 * ## Scheduling is opt-in (`TROPHIES_SYNC_ENABLED`)
 *
 * This job is **always** bound in the container and runnable by hand
 * (`bun run:command jobs:run trophies:sync --dry-run`), but
 * `inversify.config.ts` only calls `JobRunner.register(...)` for it when
 * `TROPHIES_SYNC_ENABLED=true` is set. Merging to `main` *is* the deploy
 * pipeline here, so an unconditionally-registered job would start writing
 * trophy rows and setting `isBanned`/`isExcluded` on all ~118 real community
 * members every 10 minutes from the moment this lands — before anyone had
 * watched a single run. Given `isExcluded` removes a profile from
 * `findAllNonExcluded()` (so a flagged profile is never reconsidered) and
 * there is no automatic un-flagging, the first run needs to be a decision
 * an operator makes, not a side effect of a merge. See `inversify.config.ts`
 * for the boot-time log this produces when the flag is unset, and the PR
 * description / GLOBAL-PLAN M7.3 for the full enable runbook.
 *
 * ## Catch-up mode
 *
 * For each non-excluded profile, trophies are walked newest-first
 * (`TrophySource.getProfileTrophies` already orders `last-trophy`) and the
 * walk **stops at the first already-claimed trophy** — that's what keeps a
 * routine run cheap: once a profile is caught up, every future run touches
 * it for O(1) requests (a rank check, a membership check, one page fetch
 * that immediately hits an already-claimed trophy) instead of re-walking
 * its entire history.
 *
 * ## Full re-scan override
 *
 * The plan describes a `--all --profile=X` CLI flag. This job is invoked
 * through `RunJobConsoleCommand` / `JobRunner`, and `JobContext` (Domain
 * layer, out of this PR's scope — see AGENT.md) only carries `dryRun` and
 * `workLimit`, with no channel for arbitrary extra flags. Rather than widen
 * that shared contract (JobRunner and Job.ts are being edited by other
 * agents in parallel), this job reads the override from two environment
 * variables instead, via an optional second `run()` parameter that defaults
 * to `process.env` (same pattern `JobRunner` itself uses for
 * `JOB_TICK_INTERVAL_MS`/`JOB_WORK_LIMIT`):
 *
 * ```
 * TROPHIES_SYNC_ALL=true TROPHIES_SYNC_PROFILE=<psnProfile> \
 *   bun run:command jobs:run trophies:sync
 * ```
 *
 * Because `bin/console.ts` exits the process after one run, this only ever
 * affects that single manual invocation — the long-lived bot process (which
 * schedules this job every 10 minutes, once enabled) reads its environment
 * once at boot, so an operator's one-off override can't leak into the
 * schedule unless `TROPHIES_SYNC_ALL` is set in the bot's own persistent
 * environment, which nothing in this repo does.
 *
 * ## Auto-moderation, and its safety valve
 *
 * Ported verbatim from the old bot's per-profile checks, run before the
 * trophy walk on every non-excluded profile:
 *  - No visible world/country rank (`TrophySource.getProfileRank` returns
 *    both `null`) → the PSNProfiles account is presumed banned/deleted →
 *    flag `isBanned` + `isExcluded`.
 *  - The linked Discord account is no longer in the guild
 *    (`GuildClient.isGuildMember` false, Discord error 10007 under the
 *    hood) → flag `hasLeft` + `isExcluded`.
 *
 * These decisions are **deferred**, not written immediately: `syncProfile`
 * collects them into `pendingFlags` instead of calling the repository, and
 * `resolveFlags` only commits the batch once every profile in the run has
 * been considered. If the batch is larger than
 * `MODERATION_SAFETY_VALVE_THRESHOLD`, that is treated as a broken parser,
 * not a mass exodus (see the constant's doc comment): the whole batch is
 * logged loudly, reported in `JobResult.details`, and **none of it is
 * written**. Trophy-row creation for every other profile in the same run is
 * unaffected — the valve only gates the moderation writes. A profile whose
 * flag was suppressed this way keeps its trophies un-walked for this run
 * (same as if the flag had been committed), but since nothing was actually
 * written it is not excluded either, so it is reconsidered — rank check,
 * membership check and all — from scratch on the very next scheduled run.
 *
 * Both flags are written via `TrophyProfileRepository.save`, never a
 * hard-delete (cross-cutting rule 2). `isExcluded` is what actually removes
 * a profile from `findAllNonExcluded()` — so a flagged profile naturally
 * stops being reconsidered by future runs until an operator clears the flag
 * by hand; there is no automatic un-flagging.
 *
 * ## Politeness to PSNProfiles
 *
 * This job adds no throttling of its own on top of what M7.1 already built:
 * `PsnProfilesTrophySource` serialises every request to one per second
 * (`MIN_REQUEST_INTERVAL_MS`) and identifies itself with a descriptive
 * User-Agent, and `RetryHttpClient` (bound to `TYPES.HttpClient`) already
 * retries with exponential backoff on any non-2xx response, which covers
 * 429/5xx without this job needing to distinguish them. What this job adds
 * is the *work limit*: every PSNProfiles-bound network call (a rank check,
 * a trophy-list page, a single trophy's detail page) spends one unit of the
 * run's `context.workLimit` budget, so a run over ~118 profiles is bounded
 * and resumable rather than an unbounded scrape — remaining profiles are
 * reported `skipped`, not silently dropped, and are picked up by the next
 * scheduled run.
 *
 * ## Announcements, and their flood guard (M7.8)
 *
 * Ported from the old bot's `TROPHY_WEBHOOK` announcement
 * (`old-discord-bot/scripts/parse-psn-profile.js`) — "Parabéns <@user>!
 * Acabaste de receber N TP…" — but posted by this bot itself through
 * `GuildClient.sendMessage(CommunityChannels.TROPHIES, ...)` instead of an
 * anonymous webhook (docs/plans/GLOBAL-PLAN.md M7.8, §7.7 of the feature-gap
 * doc): one fewer secret, the bot's own identity, and a channel that can be
 * reconfigured (`DISCORD_CHANNEL_TROPHIES`) without a redeploy.
 *
 * Three independent guards, because a naive port would flood the channel the
 * moment it was turned on against 4,971 already-imported trophies plus
 * whatever a fresh `trophies:sync` backlog finds:
 *
 *  1. **`TROPHIES_ANNOUNCE_ENABLED`** (env, default unset/off) — the master
 *     switch, mirroring `TROPHIES_SYNC_ENABLED`. Announcements are inert
 *     until an operator opts in, so the very first run — which can create a
 *     large backlog of "new" trophies simply because nothing existed before
 *     — never posts anything by default. This alone is enough to satisfy
 *     "a first run against a fresh profile cannot flood the channel"; the
 *     two guards below handle the case where an operator *has* opted in and
 *     a genuinely large backlog shows up later (a profile reconnecting after
 *     months away, or the flag being flipped on for the first time against
 *     profiles that already have unannounced trophies).
 *  2. **Per-profile batching** (`TROPHIES_ANNOUNCE_BATCH_THRESHOLD`, 3) — a
 *     profile whose walk creates more than a handful of new trophies in one
 *     run gets a single summary message ("Sincronizámos N troféus novos…")
 *     instead of N individual ones.
 *  3. **Per-run cap** (`TROPHIES_ANNOUNCE_MAX_MESSAGES_PER_RUN`, 10) — a hard
 *     ceiling on announcement messages across the *whole* run, so many
 *     profiles each producing a (batched or individual) message still can't
 *     add up to a flood. Trophy creation itself is never affected by this —
 *     only the announcement is skipped once the cap is spent, and it's
 *     skipped loudly (`trophies:sync.announce.suppressed`, folded into
 *     `JobResult.details.announcements`).
 *
 * A failed post (Discord down, channel misconfigured, rate limited) is
 * caught and logged per-message — it must never fail the profile it belongs
 * to, let alone the run. `--dry-run` never announces: `syncProfile` only
 * queues an announcement inside the same `!context.dryRun` branch that
 * actually calls `TrophyRepository.create`, so a dry run stays a pure
 * preview, consistent with `DiscordJobReporter` and
 * `WeekScreenshotWinner`'s own dry-run behaviour elsewhere in this codebase.
 */
@injectable()
export class TrophiesSyncJob implements Job {
    public readonly name = 'trophies:sync';
    // Matches the old bot's `@every 10m` cadence (scheduler/config.ini,
    // commented out there — this is the first time it actually runs).
    // Whether this schedule is actually registered with the JobRunner is
    // gated by TROPHIES_SYNC_ENABLED in inversify.config.ts, not here — see
    // this class's doc comment.
    public readonly schedule = '*/10 * * * *';

    constructor(
        @inject(TYPES.TrophyProfileRepository)
        private readonly trophyProfileRepository: TrophyProfileRepository,
        @inject(TYPES.TrophyRepository) private readonly trophyRepository: TrophyRepository,
        @inject(TYPES.TrophySource) private readonly trophySource: TrophySource,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async run(context: JobContext, env: NodeJS.ProcessEnv = process.env): Promise<JobResult> {
        const forceAll = env.TROPHIES_SYNC_ALL === 'true';
        const forceProfile = env.TROPHIES_SYNC_PROFILE;
        // Master switch for M7.8's announcements — see this class's doc
        // comment ("Announcements, and their flood guard"). Off by default,
        // same reasoning as TROPHIES_SYNC_ENABLED: a merge to main deploys,
        // so a feature that posts to a public channel must be an opt-in an
        // operator makes, not a side effect of landing this PR.
        const announceEnabled = env.TROPHIES_ANNOUNCE_ENABLED === 'true';

        if (forceAll && !forceProfile) {
            const message = 'TROPHIES_SYNC_ALL=true requires TROPHIES_SYNC_PROFILE to also be set';
            this.logger.error('trophies:sync.bad-config', { message });
            return {
                considered: 0,
                changed: 0,
                skipped: 0,
                failed: 0,
                details: { error: message },
            };
        }

        let profiles = await this.trophyProfileRepository.findAllNonExcluded();
        if (forceProfile) {
            profiles = profiles.filter((profile) => profile.psnProfile === forceProfile);
        }

        const budget = new Budget(context.workLimit);
        const announcementBudget = new AnnouncementBudget(TROPHIES_ANNOUNCE_MAX_MESSAGES_PER_RUN);
        let considered = 0;
        let changed = 0;
        let skipped = 0;
        let failed = 0;
        const pendingFlags: PendingFlag[] = [];
        const failedProfiles: FailedProfile[] = [];

        for (const profile of profiles) {
            if (!profile.psnProfile) {
                skipped++;
                continue;
            }

            if (!budget.has()) {
                skipped++;
                continue;
            }

            considered++;
            const isFullRescan = forceAll && forceProfile === profile.psnProfile;

            try {
                const outcome = await this.syncProfile(
                    profile,
                    context,
                    isFullRescan,
                    budget,
                    pendingFlags,
                    announceEnabled,
                    announcementBudget,
                );
                changed += outcome.changed;
                skipped += outcome.skipped;
                failed += outcome.failed;
            } catch (error) {
                failed++;
                const reason = error instanceof Error ? error.message : String(error);
                failedProfiles.push({ psnProfile: profile.psnProfile, reason });
                this.logger.error('trophies:sync.profile-failed', {
                    psnProfile: profile.psnProfile,
                    error: reason,
                });
            }
        }

        const flagResolution = await this.resolveFlags(pendingFlags, context);
        changed += flagResolution.applied.length;

        this.logger.info('trophies:sync.summary', {
            considered,
            changed,
            skipped,
            failed,
            newlyFlagged: flagResolution.applied.length,
            moderationSafetyValveTripped: flagResolution.safetyValveTripped,
            dryRun: context.dryRun,
            workLimitUsed: budget.used,
            workLimit: context.workLimit,
            announceEnabled,
            announcementsSent: announcementBudget.used,
            announcementsSuppressed: announcementBudget.suppressed,
        });

        return {
            considered,
            changed,
            skipped,
            failed,
            details: {
                // Reported separately from the raw counts on purpose (see
                // M7.3's brief): silently banning/excluding someone must
                // stay visible in the job's own report, not buried in a
                // "changed" number.
                newlyFlagged: flagResolution.applied,
                failedProfiles,
                ...(flagResolution.safetyValveTripped
                    ? {
                          moderationSafetyValveTripped: true,
                          moderationSuppressedCount: pendingFlags.length,
                          moderationSuppressedProfiles: pendingFlags.map((p) => p.psnProfile),
                      }
                    : {}),
                // M7.8: visible even when `enabled` is false, so a report
                // makes it obvious *why* nothing was posted (the master
                // switch, not a bug).
                announcements: {
                    enabled: announceEnabled,
                    sent: announcementBudget.used,
                    suppressed: announcementBudget.suppressed,
                },
            },
        };
    }

    /** One profile's worth of auto-moderation checks + catch-up trophy walk. */
    private async syncProfile(
        profile: TrophyProfile,
        context: JobContext,
        isFullRescan: boolean,
        budget: Budget,
        pendingFlags: PendingFlag[],
        announceEnabled: boolean,
        announcementBudget: AnnouncementBudget,
    ): Promise<ProfileOutcome> {
        const psnProfile = profile.psnProfile as string; // guarded by the caller

        // -- auto-moderation: no visible world/country rank -----------------
        budget.spend();
        const rank = await this.trophySource.getProfileRank(psnProfile);
        if (rank.worldRank === null && rank.countryRank === null) {
            pendingFlags.push({
                profile,
                psnProfile,
                flags: { isBanned: true, isExcluded: true },
                reason: 'isBanned + isExcluded (sem rank visível no PSNProfiles)',
            });
            return { changed: 0, skipped: 0, failed: 0 };
        }

        // -- auto-moderation: left the guild (Discord error 10007) ---------
        if (profile.userId) {
            budget.spend();
            const isMember = await this.guildClient.isGuildMember(profile.userId);
            if (!isMember) {
                pendingFlags.push({
                    profile,
                    psnProfile,
                    flags: { hasLeft: true, isExcluded: true },
                    reason: 'hasLeft + isExcluded (saiu do servidor, Discord error 10007)',
                });
                return { changed: 0, skipped: 0, failed: 0 };
            }
        }

        // -- walk platinum trophies, newest first, catch-up by default -----
        let changed = 0;
        let skipped = 0;
        let failed = 0;
        let page = 1;
        let stop = false;
        // Queued up here, announced once as a batch after the walk finishes
        // — see "Announcements, and their flood guard" on this class.
        const newAnnouncements: NewTrophyAnnouncement[] = [];

        while (!stop && budget.has()) {
            budget.spend();
            const urls = await this.trophySource.getProfileTrophies(psnProfile, page);
            if (urls.length === 0) {
                break;
            }

            for (const url of urls) {
                if (!budget.has()) {
                    stop = true;
                    break;
                }
                budget.spend();

                // Read-only pre-check, safe under --dry-run: this is what
                // implements catch-up mode's "stop at the first
                // already-claimed trophy" without ever calling the writing
                // create() path.
                const alreadyClaimed = await this.trophyRepository.existsByProfileAndUrl(
                    profile.id.toString(),
                    url,
                );
                if (alreadyClaimed) {
                    if (isFullRescan) {
                        skipped++;
                        continue;
                    }
                    stop = true;
                    break;
                }

                try {
                    const data = await this.trophySource.getPlatinumTrophyData(url);
                    const points = calculateTrophyPoints(data.percentage);

                    if (!context.dryRun) {
                        await this.trophyRepository.create(
                            profile.id.toString(),
                            url,
                            points,
                            data.completionDate,
                        );
                        // Only queued for a real write, never under
                        // --dry-run: a dry run is a preview and must not
                        // post anything, same rule `DiscordJobReporter` and
                        // `WeekScreenshotWinner` already follow.
                        if (profile.userId) {
                            newAnnouncements.push({ userId: profile.userId, url, points });
                        }
                    }
                    changed++;
                } catch (error) {
                    if (error instanceof TrophyNotEarnedYet) {
                        skipped++;
                        continue;
                    }
                    if (error instanceof TrophyAlreadyClaimed) {
                        // Lost a race against another write between the
                        // pre-check above and create() — same handling as
                        // hitting it on the pre-check.
                        if (isFullRescan) {
                            skipped++;
                            continue;
                        }
                        stop = true;
                        break;
                    }
                    failed++;
                    this.logger.error('trophies:sync.trophy-failed', {
                        psnProfile,
                        url,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }

            page++;
        }

        await this.announceNewTrophies(
            profile,
            newAnnouncements,
            announceEnabled,
            announcementBudget,
        );

        return { changed, skipped, failed };
    }

    /**
     * Turns this profile's newly-created trophies into announcement
     * message(s) — one per trophy under `TROPHIES_ANNOUNCE_BATCH_THRESHOLD`,
     * a single collapsed summary above it — and posts them through
     * `GuildClient`, spending from the run-wide `announcementBudget` as it
     * goes. See "Announcements, and their flood guard" on this class for the
     * full reasoning. Never throws: every send is isolated in
     * `postAnnouncement`.
     */
    private async announceNewTrophies(
        profile: TrophyProfile,
        announcements: NewTrophyAnnouncement[],
        announceEnabled: boolean,
        announcementBudget: AnnouncementBudget,
    ): Promise<void> {
        if (!announceEnabled || announcements.length === 0) {
            return;
        }

        if (announcements.length > TROPHIES_ANNOUNCE_BATCH_THRESHOLD) {
            // Every entry belongs to the same profile, so the same userId —
            // guarded above by `announcements.length === 0` returning early.
            const userId = announcements[0]!.userId;
            const totalPoints = announcements.reduce((sum, a) => sum + a.points, 0);
            await this.postAnnouncement(
                announcementBudget,
                profile.psnProfile,
                `Parabéns <@${userId}>! Sincronizámos ${announcements.length} troféus novos, num total de ${totalPoints} TP (Trophy Points)! 🏆`,
            );
            return;
        }

        for (const announcement of announcements) {
            await this.postAnnouncement(
                announcementBudget,
                profile.psnProfile,
                `Parabéns <@${announcement.userId}>! Acabaste de receber ${announcement.points} TP (Trophy Points) pelo teu troféu: ${announcement.url}`,
            );
        }
    }

    /**
     * The one place that actually spends the announcement budget and talks
     * to `GuildClient`. Two failure modes, both non-fatal to the run:
     *  - budget exhausted → logged and counted as suppressed, no send
     *    attempted at all;
     *  - the send itself throws (Discord down, channel misconfigured via
     *    `DISCORD_CHANNEL_TROPHIES`, rate limited) → caught and logged, same
     *    as `DiscordJobReporter`'s own reporting calls.
     */
    private async postAnnouncement(
        announcementBudget: AnnouncementBudget,
        psnProfile: string | null,
        message: string,
    ): Promise<void> {
        if (!announcementBudget.hasCapacity()) {
            announcementBudget.suppress();
            this.logger.warn('trophies:sync.announce.suppressed', {
                psnProfile,
                reason: `per-run cap of ${TROPHIES_ANNOUNCE_MAX_MESSAGES_PER_RUN} announcement messages reached`,
            });
            return;
        }

        announcementBudget.spend();
        try {
            await this.guildClient.sendMessage(CommunityChannels.TROPHIES, message);
        } catch (error) {
            this.logger.error('trophies:sync.announce.failed', {
                psnProfile,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Commits (or refuses to commit) the batch of moderation decisions this
     * run collected. See this class's doc comment ("Auto-moderation, and its
     * safety valve") for why this is a separate, deferred step rather than
     * writing each flag as soon as `syncProfile` decides on it.
     */
    private async resolveFlags(
        pendingFlags: PendingFlag[],
        context: JobContext,
    ): Promise<{ applied: FlaggedProfile[]; safetyValveTripped: boolean }> {
        if (pendingFlags.length === 0) {
            return { applied: [], safetyValveTripped: false };
        }

        if (pendingFlags.length > MODERATION_SAFETY_VALVE_THRESHOLD) {
            this.logger.error('trophies:sync.moderation-safety-valve-tripped', {
                pendingCount: pendingFlags.length,
                threshold: MODERATION_SAFETY_VALVE_THRESHOLD,
                profiles: pendingFlags.map((pending) => pending.psnProfile),
                dryRun: context.dryRun,
            });
            return { applied: [], safetyValveTripped: true };
        }

        const applied: FlaggedProfile[] = [];
        for (const pending of pendingFlags) {
            this.logger.warn('trophies:sync.flag', {
                psnProfile: pending.psnProfile,
                userId: pending.profile.userId,
                flags: pending.flags,
                dryRun: context.dryRun,
            });

            if (!context.dryRun) {
                await this.writeFlags(pending.profile, pending.flags);
            }

            applied.push({ psnProfile: pending.psnProfile, flag: pending.reason });
        }

        return { applied, safetyValveTripped: false };
    }

    private async writeFlags(
        profile: TrophyProfile,
        flags: { isBanned?: boolean; hasLeft?: boolean; isExcluded?: boolean },
    ): Promise<void> {
        const updated = new TrophyProfile(
            profile.id,
            profile.userId,
            profile.psnProfile,
            flags.isBanned ?? profile.isBanned,
            flags.hasLeft ?? profile.hasLeft,
            flags.isExcluded ?? profile.isExcluded,
            profile.createdAt,
            new Date(),
        );

        await this.trophyProfileRepository.save(updated);
    }
}
