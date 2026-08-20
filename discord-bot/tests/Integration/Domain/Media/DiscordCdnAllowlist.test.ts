import { describe, test, expect } from 'bun:test';
import { isAllowedDiscordCdnUrl } from '../../../../src/Domain/Media/DiscordCdnAllowlist.ts';

describe('isAllowedDiscordCdnUrl', () => {
    test('allows cdn.discordapp.com over https', () => {
        expect(isAllowedDiscordCdnUrl('https://cdn.discordapp.com/attachments/1/2/image.png')).toBe(
            true,
        );
    });

    test('allows media.discordapp.net over https', () => {
        expect(
            isAllowedDiscordCdnUrl(
                'https://media.discordapp.net/attachments/1/2/image.png?width=100',
            ),
        ).toBe(true);
    });

    test('rejects a look-alike host', () => {
        expect(isAllowedDiscordCdnUrl('https://cdn.discordapp.com.evil.com/x.png')).toBe(false);
        expect(isAllowedDiscordCdnUrl('https://evil.com/cdn.discordapp.com/x.png')).toBe(false);
    });

    test('rejects a non-https scheme even on an allowed host', () => {
        expect(isAllowedDiscordCdnUrl('http://cdn.discordapp.com/x.png')).toBe(false);
    });

    test('rejects an arbitrary third-party host', () => {
        expect(isAllowedDiscordCdnUrl('https://example.com/x.png')).toBe(false);
    });

    test('rejects an unparseable URL rather than throwing', () => {
        expect(isAllowedDiscordCdnUrl('not a url')).toBe(false);
    });
});
