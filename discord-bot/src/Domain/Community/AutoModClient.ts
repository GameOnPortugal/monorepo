import type {
    AutoModAction,
    AutoModEventType,
    AutoModKeywordPreset,
    AutoModRuleDefinition,
    AutoModTriggerType,
} from '../Moderation/AutoModRule.ts';

/**
 * The shape a rule comes back as from Discord — `id` plus everything
 * `AutoModRuleDefinition` has except `key` (only recoverable by parsing the
 * managed name, see `ManagedName.ts`) and `displayName` (same — it is the
 * suffix of `name` after the marker).
 */
export interface RemoteAutoModRule {
    id: string;
    /** Raw Discord rule name, e.g. "[gop-managed:starter-blocklist] Starter blocklist". */
    name: string;
    enabled: boolean;
    eventType: AutoModEventType;
    triggerType: AutoModTriggerType;
    keywordFilter: string[];
    regexPatterns: string[];
    allowList: string[];
    presets: AutoModKeywordPreset[];
    mentionTotalLimit?: number;
    mentionRaidProtectionEnabled?: boolean;
    exemptRoles: string[];
    exemptChannels: string[];
    actions: AutoModAction[];
}

/** The `@everyone` role's allow/deny bitfields on one channel — `null` if no such overwrite exists yet. */
export interface ChannelPermissionOverwrite {
    allow: bigint;
    deny: bigint;
}

/**
 * REST-only port (M4.5's pattern) onto the two Discord primitives M9.1
 * needs: AutoMod rules and channel permission overwrites. Kept separate
 * from `GuildClient` — that port is about messages, this one is about
 * guild-wide moderation configuration, and the two have no callers in
 * common.
 */
export interface AutoModClient {
    listRules(): Promise<RemoteAutoModRule[]>;

    createRule(definition: AutoModRuleDefinition): Promise<RemoteAutoModRule>;

    updateRule(remoteId: string, definition: AutoModRuleDefinition): Promise<RemoteAutoModRule>;

    deleteRule(remoteId: string): Promise<void>;

    /** The `@everyone` overwrite on a channel, or `null` if the channel has none yet. */
    getEveryoneChannelOverwrite(channelId: string): Promise<ChannelPermissionOverwrite | null>;

    putEveryoneChannelOverwrite(
        channelId: string,
        overwrite: ChannelPermissionOverwrite,
    ): Promise<void>;
}
