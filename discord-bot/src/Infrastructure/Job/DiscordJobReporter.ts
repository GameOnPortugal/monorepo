import { injectable } from 'inversify';
import type { GuildClient } from '../../Domain/Community/GuildClient.ts';
import { CommunityChannels } from '../../Domain/Community/CommunityChannels.ts';
import type { JobReportOutcome, JobReporter } from '../../Domain/Job/JobReporter.ts';
import type Logger from '../../Application/Logger/Logger.ts';

/**
 * M6.8 — posts a per-run job summary to an admin channel through the
 * existing GuildClient port, so a failed run is visible without SSH.
 *
 * Noise policy (deliberate, see the PR body for the reasoning):
 *  - Never posts for a dry run — dry runs are previews, not events.
 *  - Never posts when there is no admin channel configured — default to
 *    silence, not a wrong channel.
 *  - Always posts loudly on failure (the whole run threw, or the job
 *    reported `failed > 0` items), because a silent failure is exactly the
 *    16-months-of-nothing-running bug this milestone exists to fix.
 *  - Posts quietly on success only when something actually changed. A
 *    summary for a run that considered nothing and changed nothing is noise
 *    that gets muted — and a muted channel is the same as no channel.
 *
 * Never throws: a broken reporter must not fail the job it is reporting on.
 */
@injectable()
export class DiscordJobReporter implements JobReporter {
    constructor(
        private readonly guildClient: GuildClient,
        private readonly logger: Logger,
        /** Empty string means "not configured" — see DiscordChannels.ts ADMIN. */
        private readonly adminChannelId: string,
    ) {}

    async report(outcome: JobReportOutcome): Promise<void> {
        if (outcome.context.dryRun) {
            return;
        }

        if (this.adminChannelId === '') {
            this.logger.debug('job.report.skipped', {
                job: outcome.jobName,
                reason: 'no admin channel configured',
            });
            return;
        }

        const failed = outcome.error !== undefined || (outcome.result?.failed ?? 0) > 0;
        const changed = (outcome.result?.changed ?? 0) > 0;

        if (!failed && !changed) {
            return;
        }

        const message = failed ? this.formatFailure(outcome) : this.formatSuccess(outcome);

        try {
            await this.guildClient.sendMessage(CommunityChannels.ADMIN, message);
        } catch (error: any) {
            this.logger.error('job.report.failed', {
                job: outcome.jobName,
                error: error?.message ?? String(error),
            });
        }
    }

    private formatFailure(outcome: JobReportOutcome): string {
        const lines = [`🔴 Job **${outcome.jobName}** failed (${outcome.durationMs}ms)`];

        if (outcome.error) {
            lines.push(`Error: ${outcome.error}`);
        }

        if (outcome.result) {
            lines.push(this.formatCounts(outcome.result));
        }

        return lines.join('\n');
    }

    private formatSuccess(outcome: JobReportOutcome): string {
        const counts = outcome.result ? this.formatCounts(outcome.result) : '';
        return `✅ Job **${outcome.jobName}** (${outcome.durationMs}ms): ${counts}`;
    }

    private formatCounts(result: {
        considered: number;
        changed: number;
        skipped: number;
        failed: number;
    }): string {
        return `considered ${result.considered}, changed ${result.changed}, skipped ${result.skipped}, failed ${result.failed}`;
    }
}
