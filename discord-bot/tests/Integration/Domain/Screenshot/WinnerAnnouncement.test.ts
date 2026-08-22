import { describe, test, expect } from 'bun:test';
import { parseWinnerAnnouncement } from '../../../../src/Domain/Screenshot/WinnerAnnouncement.ts';

/**
 * The two formats below are quoted from the code that produced them, not
 * invented: the old one from `git show
 * 481661e^:old-discord-bot/scripts/screenshot-winners.js`, the current one
 * from `buildWinnerAnnouncement` in Ui/Cli/WeekScreenshotWinner.ts. If either
 * of those changes, this test should be the thing that notices.
 */
const OLD_FORMAT =
    'Parabéns <@999988887777666655> ganhaste o screenshot da semana com Elden Ring. ' +
    'Plataforma: playstation.\n\n' +
    'https://discord.com/channels/818108848492773377/827646847483904040/1234567890';

const CURRENT_FORMAT = [
    '🏆 Screenshot da Semana!',
    '',
    'Parabéns, <@999988887777666655>! O teu screenshot foi o mais votado desta semana, com 7 reações. 🎉',
    '',
    'Podes vê-lo aqui: https://discord.com/channels/818108848492773377/827646847483904040/1234567890',
].join('\n');

describe('parseWinnerAnnouncement', () => {
    test("reads the old bot's format, which never stated a vote count", () => {
        const parsed = parseWinnerAnnouncement(OLD_FORMAT);

        expect(parsed?.winningMessageId).toBe('1234567890');
        expect(parsed?.authorId).toBe('999988887777666655');
        expect(parsed?.voteCount).toBeNull();
    });

    test('reads the current format, including the announced reaction count', () => {
        const parsed = parseWinnerAnnouncement(CURRENT_FORMAT);

        expect(parsed?.winningMessageId).toBe('1234567890');
        expect(parsed?.authorId).toBe('999988887777666655');
        expect(parsed?.voteCount).toBe(7);
    });

    test('accepts the legacy discordapp.com host and nickname-style mentions', () => {
        const parsed = parseWinnerAnnouncement(
            'Parabéns <@!42> ganhaste o screenshot da semana com X. Plataforma: pc.\n\n' +
                'https://discordapp.com/channels/1/2/777',
        );

        expect(parsed?.winningMessageId).toBe('777');
        expect(parsed?.authorId).toBe('42');
    });

    test('ignores a congratulation with no permalink — there would be nothing to point at', () => {
        expect(parseWinnerAnnouncement('Parabéns <@1>! Bela screenshot 🎉')).toBeNull();
    });

    test('ignores a bare permalink with no congratulation — #screenshots is full of links', () => {
        expect(parseWinnerAnnouncement('olhem: https://discord.com/channels/1/2/3')).toBeNull();
    });

    test('parses an announcement with no mention, since the permalink is what identifies the winner', () => {
        const parsed = parseWinnerAnnouncement(
            'Parabéns! O vencedor desta semana: https://discord.com/channels/1/2/555',
        );

        expect(parsed?.winningMessageId).toBe('555');
        expect(parsed?.authorId).toBeNull();
    });
});
