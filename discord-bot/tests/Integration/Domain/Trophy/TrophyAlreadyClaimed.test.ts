import { describe, test, expect } from 'bun:test';
import { TrophyAlreadyClaimed } from '../../../../src/Domain/Trophy/TrophyAlreadyClaimed';

describe('TrophyAlreadyClaimed', () => {
    test('carries the profile id and trophy url that collided', () => {
        const error = new TrophyAlreadyClaimed(
            'profile-id-123',
            'https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes',
        );

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('TrophyAlreadyClaimed');
        expect(error.profileId).toBe('profile-id-123');
        expect(error.trophyUrl).toBe(
            'https://psnprofiles.com/trophies/11783-assassins-creed-valhalla/Josh_Lopes',
        );
        expect(error.message).toContain(error.trophyUrl);
        expect(error.message).toContain(error.profileId);
    });
});
