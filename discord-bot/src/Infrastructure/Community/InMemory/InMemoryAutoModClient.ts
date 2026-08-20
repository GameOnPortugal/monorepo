import { injectable } from 'inversify';
import type {
    AutoModClient,
    ChannelPermissionOverwrite,
    RemoteAutoModRule,
} from '../../../Domain/Community/AutoModClient.ts';
import type { AutoModRuleDefinition } from '../../../Domain/Moderation/AutoModRule.ts';
import { buildManagedRuleName } from '../../../Domain/Moderation/ManagedName.ts';
import { ClientError } from '../../../Domain/Community/ClientError.ts';

/**
 * Test/no-token stand-in for `DiscordAutoModClient`, mirroring
 * `InMemoryGuildClient`: bound automatically when `DISCORD_TOKEN` is unset,
 * so the container never has to reach Discord's network to resolve, and
 * doubles as the hand-rolled fake M9.1's integration tests use — there is no
 * mocking library in this repo, so this records real in-memory state instead
 * of stubbing method calls. **No test may make a real Discord API call**;
 * this is what stands in for one.
 */
@injectable()
export class InMemoryAutoModClient implements AutoModClient {
    private readonly rules = new Map<string, RemoteAutoModRule>();
    private readonly channelOverwrites = new Map<string, ChannelPermissionOverwrite>();
    private nextRuleId = 1;

    /** Calls made, in order — lets a test assert "dry-run made zero calls" without touching this class at all. */
    public readonly calls: string[] = [];

    /** Seeds a rule as if it already existed on the guild — e.g. a hand-made, unmanaged rule, or a pre-existing managed one. */
    seedRule(rule: RemoteAutoModRule): void {
        this.rules.set(rule.id, rule);
    }

    /** Seeds an unmanaged (not created by this repo) rule with a plain, unprefixed name — the "hand-clicked in the Discord UI" case. */
    seedUnmanagedRule(name: string, overrides: Partial<RemoteAutoModRule> = {}): RemoteAutoModRule {
        const rule: RemoteAutoModRule = {
            id: `in-memory-rule-${this.nextRuleId++}`,
            name,
            enabled: true,
            eventType: 'MESSAGE_SEND',
            triggerType: 'KEYWORD',
            keywordFilter: [],
            regexPatterns: [],
            allowList: [],
            presets: [],
            exemptRoles: [],
            exemptChannels: [],
            actions: [{ type: 'BLOCK_MESSAGE' }],
            ...overrides,
        };
        this.seedRule(rule);
        return rule;
    }

    seedChannelOverwrite(channelId: string, overwrite: ChannelPermissionOverwrite): void {
        this.channelOverwrites.set(channelId, overwrite);
    }

    reset(): void {
        this.rules.clear();
        this.channelOverwrites.clear();
        this.calls.length = 0;
        this.nextRuleId = 1;
    }

    async listRules(): Promise<RemoteAutoModRule[]> {
        this.calls.push('listRules');
        return [...this.rules.values()];
    }

    async createRule(definition: AutoModRuleDefinition): Promise<RemoteAutoModRule> {
        this.calls.push(`createRule:${definition.key}`);
        const id = `in-memory-rule-${this.nextRuleId++}`;
        const rule: RemoteAutoModRule = {
            id,
            name: buildManagedRuleName(definition.key, definition.displayName),
            enabled: definition.enabled,
            eventType: definition.eventType,
            triggerType: definition.triggerType,
            keywordFilter: [...definition.keywordFilter],
            regexPatterns: [...definition.regexPatterns],
            allowList: [...definition.allowList],
            presets: [...definition.presets],
            mentionTotalLimit: definition.mentionTotalLimit,
            mentionRaidProtectionEnabled: definition.mentionRaidProtectionEnabled,
            exemptRoles: [...definition.exemptRoles],
            exemptChannels: [...definition.exemptChannels],
            actions: definition.actions.map((action) => ({ ...action })),
        };
        this.rules.set(id, rule);
        return rule;
    }

    async updateRule(
        remoteId: string,
        definition: AutoModRuleDefinition,
    ): Promise<RemoteAutoModRule> {
        this.calls.push(`updateRule:${remoteId}`);
        if (!this.rules.has(remoteId)) {
            throw new ClientError(`InMemoryAutoModClient: no rule ${remoteId} to update`);
        }
        const rule: RemoteAutoModRule = {
            id: remoteId,
            name: buildManagedRuleName(definition.key, definition.displayName),
            enabled: definition.enabled,
            eventType: definition.eventType,
            triggerType: definition.triggerType,
            keywordFilter: [...definition.keywordFilter],
            regexPatterns: [...definition.regexPatterns],
            allowList: [...definition.allowList],
            presets: [...definition.presets],
            mentionTotalLimit: definition.mentionTotalLimit,
            mentionRaidProtectionEnabled: definition.mentionRaidProtectionEnabled,
            exemptRoles: [...definition.exemptRoles],
            exemptChannels: [...definition.exemptChannels],
            actions: definition.actions.map((action) => ({ ...action })),
        };
        this.rules.set(remoteId, rule);
        return rule;
    }

    async deleteRule(remoteId: string): Promise<void> {
        this.calls.push(`deleteRule:${remoteId}`);
        this.rules.delete(remoteId);
    }

    async getEveryoneChannelOverwrite(
        channelId: string,
    ): Promise<ChannelPermissionOverwrite | null> {
        this.calls.push(`getEveryoneChannelOverwrite:${channelId}`);
        return this.channelOverwrites.get(channelId) ?? null;
    }

    async putEveryoneChannelOverwrite(
        channelId: string,
        overwrite: ChannelPermissionOverwrite,
    ): Promise<void> {
        this.calls.push(`putEveryoneChannelOverwrite:${channelId}`);
        this.channelOverwrites.set(channelId, { ...overwrite });
    }
}
