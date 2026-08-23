/**
 * Parses a weekly-winner announcement back out of `#screenshots` history
 * (M10.7's backfill).
 *
 * Two formats have ever been posted, and both are handled:
 *
 * 1. **The old bot's** (`old-discord-bot/scripts/screenshot-winners.js`,
 *    recoverable at `git show 481661e^:old-discord-bot/scripts/screenshot-winners.js`):
 *
 *        Parabéns <@123> ganhaste o screenshot da semana com <name>. Plataforma: <platform>.
 *
 *        https://discord.com/channels/<guild>/<channel>/<messageId>
 *
 * 2. **The current one** (`Ui/Cli/WeekScreenshotWinner.ts`'s
 *    `buildWinnerAnnouncement`):
 *
 *        🏆 Screenshot da Semana!
 *
 *        Parabéns, <@123>! O teu screenshot foi o mais votado desta semana, com 7 reações. 🎉
 *
 *        Podes vê-lo aqui: https://discord.com/channels/<guild>/<channel>/<messageId>
 *
 * The **message URL is the load-bearing part**, not the prose: it names the
 * winning message, and `screenshots.message_id` is the column that maps that
 * back to a row. Everything else (the mention, the reaction count) is
 * corroborating detail that may or may not be present — the old format never
 * stated a count, which is why `voteCount` is nullable all the way down to
 * the database.
 *
 * Deliberately strict about requiring *both* a `Parabéns` opener and a
 * message link: `#screenshots` is a busy channel and a member quoting an
 * announcement, or posting a bare permalink, must not be mistaken for the
 * announcement itself. The caller additionally filters to bot-authored
 * messages (`CommunityMessage.authorIsBot`).
 */
export interface ParsedWinnerAnnouncement {
    /** The winning screenshot's own message id, from the announced permalink. */
    winningMessageId: string;
    /** The mentioned author, when the announcement mentioned one. */
    authorId: string | null;
    /** Reactions as announced. Null for the old format, which never said. */
    voteCount: number | null;
}

const CONGRATULATIONS = /Parab[ée]ns/i;
const MESSAGE_URL = /https:\/\/(?:\w+\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/(\d+)/;
const MENTION = /<@!?(\d+)>/;
const VOTE_COUNT = /com\s+(\d+)\s+rea[çc][õo]es/i;

export function parseWinnerAnnouncement(content: string): ParsedWinnerAnnouncement | null {
    if (!CONGRATULATIONS.test(content)) {
        return null;
    }

    const urlMatch = MESSAGE_URL.exec(content);
    if (!urlMatch?.[1]) {
        return null;
    }

    const mentionMatch = MENTION.exec(content);
    const voteMatch = VOTE_COUNT.exec(content);

    return {
        winningMessageId: urlMatch[1],
        authorId: mentionMatch?.[1] ?? null,
        voteCount: voteMatch?.[1] !== undefined ? Number(voteMatch[1]) : null,
    };
}
