import { inject, injectable } from 'inversify';
import dayjs from 'dayjs';
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand';
import { TYPES } from '../../Infrastructure/DependencyInjection/types';
import type { TrophyRepository } from '../../Domain/Trophy/TrophyRepository';
import type { CatchUpSummary } from '../../Domain/Trophy/CatchUpSummary';
import type { GuildClient } from '../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../Domain/Community/CommunityChannels';
import type Logger from '../../Application/Logger/Logger';
import { sleep } from '../../Application/Shared/sleep';

/** The last platinum recorded before the crawl froze — see this class's doc comment. */
const DEFAULT_SINCE = '2024-11-30';

/**
 * Discord's channel-message rate limit is generous but not unlimited, and
 * this posts one message per member in a single burst. A second between
 * sends keeps a 60-member run comfortably inside it.
 */
const SEND_INTERVAL_MS = 1000;

/** Belt and braces on a one-shot mass mention: refuse to post more than this without being told to. */
const DEFAULT_MAX_MESSAGES = 60;

export interface CatchUpAnnounceArgs {
    since: Date;
    post: boolean;
    maxMessages: number;
}

export function parseCatchUpAnnounceArgs(inputArgs: unknown): CatchUpAnnounceArgs {
    const args = Array.isArray(inputArgs)
        ? inputArgs.filter((arg) => arg !== undefined && arg !== null).map((arg) => String(arg))
        : [];

    let sinceArg = DEFAULT_SINCE;
    let post = false;
    let maxMessages = DEFAULT_MAX_MESSAGES;

    for (const raw of args) {
        if (raw === '--post') {
            post = true;
        } else if (raw.startsWith('--since=')) {
            sinceArg = raw.slice('--since='.length);
        } else if (raw.startsWith('--max=')) {
            const parsed = Number(raw.slice('--max='.length));
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error(`Invalid --max value: "${raw}"`);
            }
            maxMessages = Math.trunc(parsed);
        } else {
            throw new Error(
                `Unknown argument "${raw}". Usage: trophies:catchup-announce ` +
                    `[--since=YYYY-MM-DD] [--max=N] [--post]`,
            );
        }
    }

    const since = dayjs(sinceArg, 'YYYY-MM-DD', true);
    if (!since.isValid()) {
        throw new Error(`Invalid --since date "${sinceArg}", expected YYYY-MM-DD`);
    }

    return { since: since.startOf('day').toDate(), post, maxMessages };
}

/**
 * `trophies:catchup-announce` — the one-off "the trophy hall is alive again"
 * post.
 *
 * ## Why this is a console command and not part of the sync
 *
 * `trophies:sync` announces trophies *as it credits them*, and its flood
 * guards are tuned for steady state: a profile gaining more than three
 * trophies in one run collapses to a single summary, and the whole run is
 * capped at ten messages. Those are the right defaults forever after — and
 * exactly the wrong shape for the one moment when the crawl comes back from
 * a 20-month outage, because the backfill is spread over many runs, so what
 * a member would see is a few scattered "we synced 47 trophies" lines with
 * no explanation of why their old platinums are suddenly being mentioned.
 *
 * So the backfill runs *silently* (`TROPHIES_ANNOUNCE_ENABLED` unset), and
 * this command posts one deliberate message per member afterwards,
 * summarising everything they earned during the outage. Then normal
 * per-trophy announcements get switched on for good.
 *
 * ## Safety
 *
 * This mentions real people, once, in bulk — so unlike the rest of the
 * console commands it **previews by default** and only posts when given
 * `--post`, and it refuses to send more than `--max` messages (default 60)
 * so a wrong `--since` cannot turn into a channel-wide spray. Members with
 * no linked Discord account, or excluded profiles, are filtered out in SQL:
 * there is nobody to mention.
 *
 * ```bash
 * # preview (default)
 * bun run:command trophies:catchup-announce --since=2024-11-30
 * # send it
 * bun run:command trophies:catchup-announce --since=2024-11-30 --post
 * ```
 */
@injectable()
export default class TrophiesCatchUpAnnounce implements ConsoleCommand {
    public static commandName = 'trophies:catchup-announce';

    constructor(
        @inject(TYPES.TrophyRepository) private readonly trophyRepository: TrophyRepository,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    configureArgs(_inputArgs: any): void {}

    public async run(inputArgs: any): Promise<number> {
        const { since, post, maxMessages } = parseCatchUpAnnounceArgs(inputArgs);

        const summaries = await this.trophyRepository.findCatchUpSummariesSince(since);

        this.logger.info('trophies:catchup-announce.found', {
            since: dayjs(since).format('YYYY-MM-DD'),
            members: summaries.length,
            totalTrophies: summaries.reduce((sum, s) => sum + s.numTrophies, 0),
            totalPoints: summaries.reduce((sum, s) => sum + s.points, 0),
            post,
        });

        if (summaries.length === 0) {
            this.logger.info('trophies:catchup-announce.nothing-to-announce', {
                since: dayjs(since).format('YYYY-MM-DD'),
            });
            return 0;
        }

        if (summaries.length > maxMessages) {
            // Refused rather than truncated: a count this far above
            // expectations usually means `--since` is wrong, and quietly
            // posting the first N would be the worst of both outcomes.
            this.logger.error('trophies:catchup-announce.too-many', {
                members: summaries.length,
                maxMessages,
                message:
                    'Refusing to post: more members than --max. Check --since, ' +
                    'or raise --max deliberately.',
            });
            return 1;
        }

        let sent = 0;
        let failed = 0;

        for (const summary of summaries) {
            const message = this.buildMessage(summary, since);

            if (!post) {
                this.logger.info('trophies:catchup-announce.preview', {
                    psnProfile: summary.psnProfile,
                    trophies: summary.numTrophies,
                    points: summary.points,
                    message,
                });
                continue;
            }

            try {
                await this.guildClient.sendMessage(CommunityChannels.TROPHIES, message);
                sent++;
            } catch (error) {
                // One member's message failing must not abandon the rest of
                // the run — the whole point is that everybody hears about it.
                failed++;
                this.logger.error('trophies:catchup-announce.send-failed', {
                    psnProfile: summary.psnProfile,
                    error: error instanceof Error ? error.message : String(error),
                });
            }

            await sleep(SEND_INTERVAL_MS);
        }

        this.logger.info('trophies:catchup-announce.finish', {
            members: summaries.length,
            sent,
            failed,
            previewOnly: !post,
        });

        return failed > 0 ? 1 : 0;
    }

    private buildMessage(summary: CatchUpSummary, since: Date): string {
        const trophyWord = summary.numTrophies === 1 ? 'troféu platina' : 'troféus platina';

        return (
            `🏆 Parabéns <@${summary.userId}>! O ranking de troféus está de volta — ` +
            `desde ${this.formatMonth(since)} conquistaste ` +
            `**${this.formatNumber(summary.numTrophies)} ${trophyWord}**, ` +
            `num total de **${this.formatNumber(summary.points)} TP**. ` +
            `Já está tudo contabilizado: vê a tua posição com \`/trophy rank\`.`
        );
    }

    /** Matches `RankPresenter`'s month formatting rather than pulling in a dayjs locale. */
    private formatMonth(date: Date): string {
        return date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    }

    private formatNumber(value: number): string {
        return value.toLocaleString('pt-PT');
    }
}
