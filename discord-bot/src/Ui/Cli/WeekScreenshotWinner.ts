import { inject, injectable } from 'inversify';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import CommandHandlerManager from '../../Infrastructure/CommandHandler/CommandHandlerManager';
import { GetScreenshotWinner } from '../../Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinner';
import type {
    ScreenshotWinner,
    ScreenshotWinnerResult,
} from '../../Application/Query/Screenshot/GetScreenshotWinner/GetScreenshotWinnerHandler';
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand';
import { TYPES } from '../../Infrastructure/DependencyInjection/types';
import type { GuildClient } from '../../Domain/Community/GuildClient';
import { CommunityChannels } from '../../Domain/Community/CommunityChannels';
import type Logger from '../../Application/Logger/Logger';
import {
    COMMUNITY_TIMEZONE,
    computeWeekWindow,
    nextContestOpeningDay,
    type WeekWindow,
} from '../../Domain/Screenshot/ScreenshotWeekWindow';

dayjs.extend(utc);
dayjs.extend(timezone);

export type WeekScreenshotWinnerMode = 'public' | 'dry-run';

export interface WeekScreenshotWinnerArgs {
    date: Date;
    mode: WeekScreenshotWinnerMode;
}

/**
 * Parses `bin/console.ts week-screenshot-winner [...]`.
 *
 * Accepts a clearer flag form — `--date=YYYY-MM-DD` and `--dry-run` — and
 * keeps the historical positional shape working: `inputArgs[0]` as a date
 * string, `inputArgs[1] === 'true'` for dry-run. That positional form used
 * to be interpreted inline in `run()` with zero validation (an invalid date
 * silently became `Invalid Date`); this centralises and validates it while
 * leaving the call shape itself alone, since `bin/console.ts` is owned by a
 * parallel PR and is not touched here.
 */
export function parseWeekScreenshotWinnerArgs(inputArgs: unknown): WeekScreenshotWinnerArgs {
    const args = Array.isArray(inputArgs) ? inputArgs.map((arg) => String(arg)) : [];

    let dateArg: string | undefined;
    let dryRun = false;

    for (const raw of args) {
        if (raw === '--dry-run' || raw === '--dry-run=true') {
            dryRun = true;
        } else if (raw === '--dry-run=false') {
            dryRun = false;
        } else if (raw.startsWith('--date=')) {
            dateArg = raw.slice('--date='.length);
        } else if (raw === 'true' || raw === 'false') {
            // Legacy positional dryRun flag (previously `inputArgs[1]`).
            dryRun = raw === 'true';
        } else if (raw.length > 0 && dateArg === undefined) {
            // Legacy positional date (previously `inputArgs[0]`).
            dateArg = raw;
        }
    }

    const date = dateArg === undefined || dateArg === '' ? new Date() : new Date(dateArg);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`week-screenshot-winner: invalid date argument "${dateArg}"`);
    }

    return { date, mode: dryRun ? 'dry-run' : 'public' };
}

function buildWinnerAnnouncement(winner: ScreenshotWinner): string {
    return [
        '🏆 Screenshot da Semana!',
        '',
        `Parabéns, <@${winner.screenshot.authorId}>! O teu screenshot foi o mais votado desta semana, com ${winner.reactionCount} reações. 🎉`,
        '',
        `Podes vê-lo aqui: ${winner.messageUrl}`,
    ].join('\n');
}

/**
 * Ports the old bot's closing banner
 * (`old-discord-bot/scripts/screenshot-winners.js`):
 * `'========= Concurso ' + tomorrow.format('DD/MM') + ' ABERTO ==========='`,
 * sent right after the winner announcement to open the next contest. It was
 * always a plain text divider — no image asset was referenced, so there is
 * nothing missing to port here.
 */
function buildContestOpeningBanner(window: WeekWindow): string {
    const openingDay = dayjs.tz(nextContestOpeningDay(window), COMMUNITY_TIMEZONE).format('DD/MM');

    return `========= Concurso ${openingDay} ABERTO ===========`;
}

function buildDryRunReport(
    result: ScreenshotWinnerResult,
    window: WeekWindow,
    announcement: string,
    banner: string,
): string {
    const winner = result.winner as ScreenshotWinner;
    const from = dayjs.tz(window.start, COMMUNITY_TIMEZONE).format('DD/MM/YYYY');
    const to = dayjs.tz(window.end, COMMUNITY_TIMEZONE).format('DD/MM/YYYY');

    return [
        '🧪 [DRY RUN] week-screenshot-winner — nothing was posted publicly.',
        `Week evaluated: ${from} — ${to} (${COMMUNITY_TIMEZONE})`,
        `Candidates found: ${result.candidateCount} (skipped/vanished: ${result.skippedCount})`,
        `Winner: <@${winner.screenshot.authorId}> — ${winner.reactionCount} reações — ${winner.messageUrl}`,
        '',
        `Would post to #${CommunityChannels.SCREENSHOTS}:`,
        '---',
        announcement,
        '---',
        banner,
    ].join('\n');
}

@injectable()
export default class WeekScreenshotWinner implements ConsoleCommand {
    public static commandName = 'week-screenshot-winner';

    constructor(
        @inject(CommandHandlerManager)
        private readonly commandHandlerManager: CommandHandlerManager,
        @inject(TYPES.GuildClient) private readonly guildClient: GuildClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    configureArgs(inputArgs: any): void {}

    public async run(inputArgs: any): Promise<number> {
        const { date, mode } = parseWeekScreenshotWinnerArgs(inputArgs);

        this.logger.info('Running week screenshot winner command', { date, mode });

        const window = computeWeekWindow(date);
        const result: ScreenshotWinnerResult = await this.commandHandlerManager.handle(
            new GetScreenshotWinner(date),
        );

        if (result.winner === null) {
            this.logger.info('No winner found for the specified week', {
                candidateCount: result.candidateCount,
                skippedCount: result.skippedCount,
            });
            return 0;
        }

        const winnerInfo = {
            authorId: result.winner.screenshot.authorId,
            reactionCount: result.winner.reactionCount,
            messageUrl: result.winner.messageUrl,
            skippedCount: result.skippedCount,
        };

        const announcement = buildWinnerAnnouncement(result.winner);
        const banner = buildContestOpeningBanner(window);

        if (mode === 'dry-run') {
            try {
                await this.guildClient.sendMessage(
                    CommunityChannels.ADMIN,
                    buildDryRunReport(result, window, announcement, banner),
                );
            } catch (error: any) {
                this.logger.error('Failed to send dry-run report to the admin channel', {
                    error: error.message,
                });
                return 1;
            }

            this.logger.info('Dry run complete — report sent to the admin channel', winnerInfo);
            return 0;
        }

        // Send the winner announcement, then the next contest's opening
        // banner, to the public screenshots channel. Deliberately does NOT
        // send `!give-xp <@user> 1000` (decision, GLOBAL-PLAN.md M6.4 /
        // 02-scheduler-and-lifecycle.md decision 5): that command targets a
        // *different* bot and nobody has confirmed it is still in the guild.
        // An unrecognised command posted in front of the community is worse
        // than not awarding XP. Bring it back only once that bot's presence
        // is confirmed.
        try {
            await this.guildClient.sendMessage(CommunityChannels.SCREENSHOTS, announcement);
            await this.guildClient.sendMessage(CommunityChannels.SCREENSHOTS, banner);
            this.logger.info('Winner announcement sent successfully', winnerInfo);
        } catch (error: any) {
            this.logger.error('Failed to send winner announcement', { error: error.message });
            return 1;
        }

        return 0;
    }
}
