import { describe, test, expect } from 'bun:test';
import {
    buildManagedRuleName,
    ManagedRuleNameTooLongError,
    parseManagedRuleKey,
    parseManagedRuleName,
} from '../../../../src/Domain/Moderation/ManagedName.ts';

describe('buildManagedRuleName / parseManagedRuleName', () => {
    test('round-trips key and displayName through the managed name', () => {
        const name = buildManagedRuleName('starter-blocklist', 'Starter blocklist');

        expect(name).toBe('[gop-managed:starter-blocklist] Starter blocklist');
        expect(parseManagedRuleName(name)).toEqual({
            key: 'starter-blocklist',
            displayName: 'Starter blocklist',
        });
        expect(parseManagedRuleKey(name)).toBe('starter-blocklist');
    });

    test("throws when the built name would exceed Discord's 100-character limit", () => {
        expect(() => buildManagedRuleName('starter-blocklist', 'x'.repeat(90))).toThrow(
            ManagedRuleNameTooLongError,
        );
    });

    test('a name with no managed marker parses to null', () => {
        expect(parseManagedRuleName('Some rule a moderator made by hand')).toBeNull();
        expect(parseManagedRuleKey('Some rule a moderator made by hand')).toBeNull();
    });

    test("a name with a different tool's marker parses to null", () => {
        expect(parseManagedRuleName('[some-other-bot:key] Display')).toBeNull();
    });

    test('an empty displayName still round-trips (empty string, not undefined)', () => {
        const name = buildManagedRuleName('k', '');

        expect(parseManagedRuleName(name)).toEqual({ key: 'k', displayName: '' });
    });
});
