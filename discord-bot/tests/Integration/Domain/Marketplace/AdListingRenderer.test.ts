import { describe, expect, test } from 'bun:test';
import { renderAdListing } from '../../../../src/Domain/Marketplace/AdListingRenderer';
import { Ad } from '../../../../src/Domain/Marketplace/Ad';
import { AdId } from '../../../../src/Domain/Marketplace/AdId';
import { parseCustomId } from '../../../../src/Domain/Bot/CustomId';

function buildAd(adType: string): Ad {
    return new Ad(
        AdId.generate(),
        'PS5 DualSense Controller',
        '123456789012345678',
        '818447274266591243',
        'some-message-id',
        'new',
        '50€',
        'Porto',
        'included',
        '',
        '',
        adType,
        new Date(),
        new Date(),
    );
}

/**
 * M5.5: the posted listing — colour-coded by type, ad id in the footer (so a
 * row is recoverable from the message alone), and buttons built exclusively
 * through `buildCustomId()`.
 */
describe('renderAdListing', () => {
    test('sell ads are mint-coloured', () => {
        const content = renderAdListing(buildAd('sell'));
        expect(content.color).toBe(0x8afbcc);
    });

    test('wanted ads are blue-coloured — the renderer is already shaped for M5.7', () => {
        const content = renderAdListing(buildAd('wanted'));
        expect(content.color).toBe(0x4199e7);
    });

    test('the footer carries the ad id, so the row is recoverable from the message alone', () => {
        const ad = buildAd('sell');
        const content = renderAdListing(ad);
        expect(content.footerText).toContain(ad.id.toString());
    });

    test('every button customId round-trips through parseCustomId under the mkt namespace', () => {
        const ad = buildAd('sell');
        const content = renderAdListing(ad);

        expect(content.buttons?.length).toBe(3);
        const actions = content.buttons?.map((button) => {
            const parsed = parseCustomId(button.customId);
            expect(parsed?.namespace).toBe('mkt');
            expect(parsed?.args).toEqual([ad.id.toString()]);
            return parsed?.action;
        });

        expect(actions).toEqual(['contact', 'sold', 'bump']);
    });

    test('uses the provided author display name over the raw id', () => {
        const content = renderAdListing(buildAd('sell'), { authorDisplayName: 'joshlopes' });
        expect(content.authorName).toBe('joshlopes');
    });
});
