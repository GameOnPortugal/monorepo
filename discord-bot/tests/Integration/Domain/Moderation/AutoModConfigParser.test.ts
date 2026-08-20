import { describe, test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { parseAutoModConfig } from '../../../../src/Domain/Moderation/AutoModConfigParser.ts';

/**
 * M9.1 — the config file is validated wholesale before anything ever
 * touches the Discord API. Regression coverage for the definition-of-done
 * requirement that an invalid file is rejected with a useful message
 * rather than half-applied.
 */

function validRule(overrides: Record<string, unknown> = {}) {
    return {
        key: 'starter-keyword-blocklist',
        displayName: 'Starter keyword blocklist',
        enabled: false,
        eventType: 'MESSAGE_SEND',
        triggerType: 'KEYWORD',
        keywordFilter: ['examplebadword'],
        regexPatterns: [],
        allowList: [],
        exemptRoles: [],
        exemptChannels: [],
        actions: [{ type: 'BLOCK_MESSAGE', customMessage: 'Blocked.' }],
        ...overrides,
    };
}

describe('parseAutoModConfig — valid configs', () => {
    test('parses a minimal valid config', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule()],
            commandsOnlyChannels: [],
        });

        expect(errors).toEqual([]);
        expect(config?.rules).toHaveLength(1);
        expect(config?.rules[0]?.key).toBe('starter-keyword-blocklist');
    });

    test('commandsOnlyChannels defaults to empty when omitted', () => {
        const { config, errors } = parseAutoModConfig({ rules: [] });

        expect(errors).toEqual([]);
        expect(config?.commandsOnlyChannels).toEqual([]);
    });

    test('accepts a valid commandsOnlyChannels entry', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [],
            commandsOnlyChannels: [{ channelId: '818108848492773377', note: 'bot commands only' }],
        });

        expect(errors).toEqual([]);
        expect(config?.commandsOnlyChannels).toEqual([
            { channelId: '818108848492773377', note: 'bot commands only' },
        ]);
    });

    test('the checked-in starter config file itself parses and validates cleanly', async () => {
        const contents = await readFile(
            new URL('../../../../config/automod-rules.json', import.meta.url),
            'utf-8',
        );
        const { config, errors } = parseAutoModConfig(JSON.parse(contents));

        expect(errors).toEqual([]);
        expect(config).toBeDefined();
        expect(config?.rules.every((rule) => rule.enabled === false)).toBe(true);
    });
});

describe('parseAutoModConfig — rejected wholesale, not half-applied', () => {
    test('a top-level non-object is rejected', () => {
        const { config, errors } = parseAutoModConfig('not an object');

        expect(config).toBeUndefined();
        expect(errors).toEqual(['config must be a JSON object']);
    });

    test('one bad rule rejects the whole file, including the good rules', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [
                validRule({ key: 'good-rule' }),
                validRule({ key: 'bad-rule', triggerType: 'NOT_REAL' }),
            ],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('rules[1].triggerType'))).toBe(true);
    });

    test('missing required fields produce useful, field-scoped messages', () => {
        const { config, errors } = parseAutoModConfig({ rules: [{}] });

        expect(config).toBeUndefined();
        expect(errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining('rules[0].key'),
                expect.stringContaining('rules[0].displayName'),
                expect.stringContaining('rules[0].enabled'),
                expect.stringContaining('rules[0].eventType'),
                expect.stringContaining('rules[0].triggerType'),
                expect.stringContaining('rules[0].actions'),
            ]),
        );
    });

    test('a KEYWORD rule with no keywordFilter and no regexPatterns is rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ keywordFilter: [], regexPatterns: [] })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('KEYWORD/MEMBER_PROFILE'))).toBe(true);
    });

    test('duplicate rule keys are rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ key: 'dup' }), validRule({ key: 'dup' })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('duplicate key "dup"'))).toBe(true);
    });

    test('duplicate commandsOnlyChannels entries are rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [],
            commandsOnlyChannels: [
                { channelId: '818108848492773377' },
                { channelId: '818108848492773377' },
            ],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('duplicate channelId'))).toBe(true);
    });

    test("a name that would exceed Discord's 100-character rule name limit is rejected", () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ displayName: 'x'.repeat(100) })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('100-character'))).toBe(true);
    });

    test("more than 6 KEYWORD rules is rejected (Discord's per-guild cap)", () => {
        const rules = Array.from({ length: 7 }, (_, index) => validRule({ key: `rule-${index}` }));
        const { config, errors } = parseAutoModConfig({ rules });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('at most 6 per guild'))).toBe(true);
    });

    test('a SEND_ALERT_MESSAGE action without a channelId is rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ actions: [{ type: 'SEND_ALERT_MESSAGE' }] })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('actions[0].channelId'))).toBe(true);
    });

    test('a non-snowflake exemptRoles entry is rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ exemptRoles: ['not-a-snowflake'] })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('exemptRoles'))).toBe(true);
    });

    test('a non-snowflake commandsOnlyChannels channelId is rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [],
            commandsOnlyChannels: [{ channelId: 'general' }],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('channelId'))).toBe(true);
    });

    for (const mentionTotalLimit of [0, 51, 1.5]) {
        test(`a mentionTotalLimit of ${mentionTotalLimit} outside Discord's 1-50 integer range is rejected`, () => {
            const { config, errors } = parseAutoModConfig({
                rules: [
                    validRule({
                        triggerType: 'MENTION_SPAM',
                        keywordFilter: [],
                        mentionTotalLimit,
                    }),
                ],
            });

            expect(config).toBeUndefined();
            expect(errors.some((error) => error.includes('mentionTotalLimit'))).toBe(true);
        });
    }

    test('a mentionTotalLimit within 1-50 is accepted', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [
                validRule({ triggerType: 'MENTION_SPAM', keywordFilter: [], mentionTotalLimit: 5 }),
            ],
        });

        expect(errors).toEqual([]);
        expect(config?.rules[0]?.mentionTotalLimit).toBe(5);
    });

    test('a MEMBER_PROFILE trigger with a MESSAGE_SEND event is rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ triggerType: 'MEMBER_PROFILE', eventType: 'MESSAGE_SEND' })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('requires eventType "MEMBER_UPDATE"'))).toBe(
            true,
        );
    });

    test('a KEYWORD trigger with a MEMBER_UPDATE event is rejected', () => {
        const { config, errors } = parseAutoModConfig({
            rules: [validRule({ eventType: 'MEMBER_UPDATE' })],
        });

        expect(config).toBeUndefined();
        expect(errors.some((error) => error.includes('requires eventType "MESSAGE_SEND"'))).toBe(
            true,
        );
    });
});
