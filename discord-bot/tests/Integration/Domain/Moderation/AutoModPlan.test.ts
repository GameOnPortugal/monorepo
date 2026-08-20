import { describe, test, expect } from 'bun:test';
import { buildRulePlan } from '../../../../src/Domain/Moderation/AutoModPlan.ts';
import { buildManagedRuleName } from '../../../../src/Domain/Moderation/ManagedName.ts';
import type { AutoModRuleDefinition } from '../../../../src/Domain/Moderation/AutoModRule.ts';
import type { RemoteAutoModRule } from '../../../../src/Domain/Community/AutoModClient.ts';

function definition(overrides: Partial<AutoModRuleDefinition> = {}): AutoModRuleDefinition {
    return {
        key: 'blocklist',
        displayName: 'Blocklist',
        enabled: true,
        eventType: 'MESSAGE_SEND',
        triggerType: 'KEYWORD',
        keywordFilter: ['badword'],
        regexPatterns: [],
        allowList: [],
        presets: [],
        exemptRoles: [],
        exemptChannels: [],
        actions: [{ type: 'BLOCK_MESSAGE', customMessage: 'blocked' }],
        ...overrides,
    };
}

function remoteFrom(
    def: AutoModRuleDefinition,
    id: string,
    overrides: Partial<RemoteAutoModRule> = {},
): RemoteAutoModRule {
    return {
        id,
        name: buildManagedRuleName(def.key, def.displayName),
        enabled: def.enabled,
        eventType: def.eventType,
        triggerType: def.triggerType,
        keywordFilter: def.keywordFilter,
        regexPatterns: def.regexPatterns,
        allowList: def.allowList,
        presets: def.presets,
        mentionTotalLimit: def.mentionTotalLimit,
        mentionRaidProtectionEnabled: def.mentionRaidProtectionEnabled,
        exemptRoles: def.exemptRoles,
        exemptChannels: def.exemptChannels,
        actions: def.actions,
        ...overrides,
    };
}

describe('buildRulePlan', () => {
    test('a rule with no remote counterpart is planned for creation', () => {
        const plan = buildRulePlan([definition()], []);

        expect(plan.toCreate).toEqual([definition()]);
        expect(plan.toUpdate).toEqual([]);
        expect(plan.toRecreate).toEqual([]);
        expect(plan.unchanged).toEqual([]);
        expect(plan.orphanedManaged).toEqual([]);
    });

    test('an identical remote rule is unchanged — no call needed', () => {
        const def = definition();
        const remote = remoteFrom(def, 'remote-1');

        const plan = buildRulePlan([def], [remote]);

        expect(plan.unchanged).toEqual([def]);
        expect(plan.toCreate).toEqual([]);
        expect(plan.toUpdate).toEqual([]);
        expect(plan.toRecreate).toEqual([]);
    });

    test('a body difference with the same triggerType is an update, not a recreate', () => {
        const def = definition({ keywordFilter: ['badword', 'anotherword'] });
        const remote = remoteFrom(definition(), 'remote-1'); // still just ['badword']

        const plan = buildRulePlan([def], [remote]);

        expect(plan.toUpdate).toEqual([{ definition: def, remoteId: 'remote-1' }]);
        expect(plan.toRecreate).toEqual([]);
    });

    test('a triggerType change is a recreate (delete + create), never a plain update', () => {
        const def = definition({ triggerType: 'KEYWORD_PRESET', presets: ['PROFANITY'] });
        const remote = remoteFrom(definition(), 'remote-1'); // remote is still KEYWORD

        const plan = buildRulePlan([def], [remote]);

        expect(plan.toRecreate).toEqual([{ definition: def, remoteId: 'remote-1' }]);
        expect(plan.toUpdate).toEqual([]);
    });

    test('a managed rule removed from the file is reported as orphaned, not deleted', () => {
        const remote = remoteFrom(definition(), 'remote-1');

        const plan = buildRulePlan([], [remote]);

        expect(plan.orphanedManaged).toEqual([remote]);
        expect(plan.toCreate).toEqual([]);
        expect(plan.toUpdate).toEqual([]);
        expect(plan.toRecreate).toEqual([]);
    });

    test('an unmanaged rule (no marker in its name) is invisible to the plan entirely', () => {
        const handMadeRule: RemoteAutoModRule = {
            id: 'hand-made-1',
            name: 'Server rules I made in the Discord UI',
            enabled: true,
            eventType: 'MESSAGE_SEND',
            triggerType: 'SPAM',
            keywordFilter: [],
            regexPatterns: [],
            allowList: [],
            presets: [],
            exemptRoles: [],
            exemptChannels: [],
            actions: [{ type: 'BLOCK_MESSAGE' }],
        };

        const plan = buildRulePlan([definition()], [handMadeRule]);

        expect(plan.toCreate).toEqual([definition()]);
        expect(plan.orphanedManaged).toEqual([]);
        // The hand-made rule never shows up anywhere in the plan — not as
        // orphaned, not as a candidate for update. It simply does not exist
        // as far as this plan is concerned.
    });

    test('a rule with a matching key but a different managed marker prefix is treated as unmanaged', () => {
        const otherToolRule: RemoteAutoModRule = {
            id: 'other-1',
            name: '[some-other-bot:blocklist] Blocklist',
            enabled: true,
            eventType: 'MESSAGE_SEND',
            triggerType: 'KEYWORD',
            keywordFilter: ['badword'],
            regexPatterns: [],
            allowList: [],
            presets: [],
            exemptRoles: [],
            exemptChannels: [],
            actions: [{ type: 'BLOCK_MESSAGE', customMessage: 'blocked' }],
        };

        const plan = buildRulePlan([definition()], [otherToolRule]);

        expect(plan.toCreate).toEqual([definition()]);
        expect(plan.orphanedManaged).toEqual([]);
    });

    test('multiple keys are diffed independently — create, unchanged and orphaned in the same run', () => {
        const unchangedDef = definition({ key: 'unchanged-key' });
        const newDef = definition({ key: 'new-key' });
        const remoteUnchanged = remoteFrom(unchangedDef, 'remote-unchanged');
        const remoteOrphaned = remoteFrom(definition({ key: 'gone-key' }), 'remote-orphaned');

        const plan = buildRulePlan([unchangedDef, newDef], [remoteUnchanged, remoteOrphaned]);

        expect(plan.unchanged).toEqual([unchangedDef]);
        expect(plan.toCreate).toEqual([newDef]);
        expect(plan.orphanedManaged).toEqual([remoteOrphaned]);
    });
});
