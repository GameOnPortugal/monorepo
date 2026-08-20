import type { RemoteAutoModRule } from '../Community/AutoModClient.ts';
import type { AutoModAction, AutoModRuleDefinition } from './AutoModRule.ts';
import { parseManagedRuleName } from './ManagedName.ts';

export interface RuleUpdateEntry {
    definition: AutoModRuleDefinition;
    remoteId: string;
}

export interface RuleRecreateEntry extends RuleUpdateEntry {
    /**
     * The full remote rule being replaced, kept so the caller can roll back
     * — recreate it verbatim — if the CREATE half of delete-then-create
     * fails after the DELETE half already succeeded.
     */
    remote: RemoteAutoModRule;
}

export interface RulePlan {
    /** In the file, not on Discord (or on Discord but unmanaged) — create. */
    toCreate: AutoModRuleDefinition[];
    /** Same `triggerType` on both sides, body differs — PATCH in place. */
    toUpdate: RuleUpdateEntry[];
    /**
     * `triggerType` differs between file and remote. Discord's PATCH
     * endpoint cannot change a rule's trigger type at all, so this is a
     * DELETE of `remoteId` followed by a CREATE, never a PATCH.
     */
    toRecreate: RuleRecreateEntry[];
    /** Matches Discord exactly already — no call needed. */
    unchanged: AutoModRuleDefinition[];
    /**
     * Carries the managed marker (so this repo created it) but is no longer
     * in the file. Never deleted implicitly — see M9.1's reconciliation
     * design call: a rule someone removed from the file by accident, or
     * that is mid-review in a PR, must not vanish from the live guild the
     * moment an unrelated key changes. Surfaced so an operator can choose
     * `--prune-orphaned` deliberately.
     */
    orphanedManaged: RemoteAutoModRule[];
}

function actionsEqual(a: AutoModAction[], b: AutoModAction[]): boolean {
    if (a.length !== b.length) return false;
    const normalize = (action: AutoModAction) => JSON.stringify(action, Object.keys(action).sort());
    const left = [...a].map(normalize).sort();
    const right = [...b].map(normalize).sort();
    return left.every((value, index) => value === right[index]);
}

function stringSetEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const left = [...a].sort();
    const right = [...b].sort();
    return left.every((value, index) => value === right[index]);
}

/** True if applying `definition` would be a no-op against `remote` (same triggerType assumed already checked by the caller). */
export function ruleMatchesRemote(
    definition: AutoModRuleDefinition,
    remote: RemoteAutoModRule,
): boolean {
    const parsed = parseManagedRuleName(remote.name);
    if (!parsed || parsed.key !== definition.key) return false;

    return (
        parsed.displayName === definition.displayName &&
        definition.enabled === remote.enabled &&
        definition.eventType === remote.eventType &&
        definition.triggerType === remote.triggerType &&
        stringSetEqual(definition.keywordFilter, remote.keywordFilter) &&
        stringSetEqual(definition.regexPatterns, remote.regexPatterns) &&
        stringSetEqual(definition.allowList, remote.allowList) &&
        stringSetEqual(definition.presets, remote.presets) &&
        (definition.mentionTotalLimit ?? null) === (remote.mentionTotalLimit ?? null) &&
        (definition.mentionRaidProtectionEnabled ?? null) ===
            (remote.mentionRaidProtectionEnabled ?? null) &&
        stringSetEqual(definition.exemptRoles, remote.exemptRoles) &&
        stringSetEqual(definition.exemptChannels, remote.exemptChannels) &&
        actionsEqual(definition.actions, remote.actions)
    );
}

/**
 * Reconstructs the definition a managed remote rule was created from, so a
 * failed recreate (see `RuleRecreateEntry`) can be rolled back to the exact
 * rule that was just deleted. Returns `undefined` for a rule with no managed
 * marker — callers only ever pass rules this repo created in the first
 * place, so that should be unreachable in practice.
 */
export function remoteRuleToDefinition(
    remote: RemoteAutoModRule,
): AutoModRuleDefinition | undefined {
    const parsed = parseManagedRuleName(remote.name);
    if (!parsed) return undefined;

    return {
        key: parsed.key,
        displayName: parsed.displayName,
        enabled: remote.enabled,
        eventType: remote.eventType,
        triggerType: remote.triggerType,
        keywordFilter: remote.keywordFilter,
        regexPatterns: remote.regexPatterns,
        allowList: remote.allowList,
        presets: remote.presets,
        mentionTotalLimit: remote.mentionTotalLimit,
        mentionRaidProtectionEnabled: remote.mentionRaidProtectionEnabled,
        exemptRoles: remote.exemptRoles,
        exemptChannels: remote.exemptChannels,
        actions: remote.actions,
    };
}

/**
 * Diffs the desired config against every rule Discord currently reports for
 * the guild. Rules without the managed marker (see `ManagedName.ts`) —
 * anything clicked into existence by hand in the Discord UI — are filtered
 * out up front and never appear in any bucket here, which is what keeps a
 * hand-made rule safe from an `automod:apply --apply` run.
 */
export function buildRulePlan(
    desired: AutoModRuleDefinition[],
    remoteRules: RemoteAutoModRule[],
): RulePlan {
    const remoteManagedByKey = new Map<string, RemoteAutoModRule>();
    for (const remote of remoteRules) {
        const parsed = parseManagedRuleName(remote.name);
        if (parsed) {
            remoteManagedByKey.set(parsed.key, remote);
        }
    }

    const plan: RulePlan = {
        toCreate: [],
        toUpdate: [],
        toRecreate: [],
        unchanged: [],
        orphanedManaged: [],
    };

    const seenKeys = new Set<string>();

    for (const definition of desired) {
        seenKeys.add(definition.key);
        const remote = remoteManagedByKey.get(definition.key);

        if (!remote) {
            plan.toCreate.push(definition);
            continue;
        }

        if (remote.triggerType !== definition.triggerType) {
            plan.toRecreate.push({ definition, remoteId: remote.id, remote });
            continue;
        }

        if (ruleMatchesRemote(definition, remote)) {
            plan.unchanged.push(definition);
        } else {
            plan.toUpdate.push({ definition, remoteId: remote.id });
        }
    }

    for (const [key, remote] of remoteManagedByKey) {
        if (!seenKeys.has(key)) {
            plan.orphanedManaged.push(remote);
        }
    }

    return plan;
}
