/**
 * Value types for M9.1 — Discord AutoMod rules defined as checked-in JSON
 * (docs/plans/GLOBAL-PLAN.md M9.1, decision 4). Zero framework imports by
 * design (CLAUDE.md): these are the same shapes discord.js/discord-api-types
 * expose, hand-copied rather than imported, so Domain/ never depends on the
 * Discord SDK. `Infrastructure/Community/Discord/DiscordAutoModClient.ts` is
 * the only place that translates between these string unions and discord.js's
 * numeric enums.
 */

export const AUTOMOD_EVENT_TYPES = ['MESSAGE_SEND', 'MEMBER_UPDATE'] as const;
export type AutoModEventType = (typeof AUTOMOD_EVENT_TYPES)[number];

export const AUTOMOD_TRIGGER_TYPES = [
    'KEYWORD',
    'SPAM',
    'KEYWORD_PRESET',
    'MENTION_SPAM',
    'MEMBER_PROFILE',
] as const;
export type AutoModTriggerType = (typeof AUTOMOD_TRIGGER_TYPES)[number];

export const AUTOMOD_ACTION_TYPES = [
    'BLOCK_MESSAGE',
    'SEND_ALERT_MESSAGE',
    'TIMEOUT',
    'BLOCK_MEMBER_INTERACTION',
] as const;
export type AutoModActionType = (typeof AUTOMOD_ACTION_TYPES)[number];

export const AUTOMOD_KEYWORD_PRESETS = ['PROFANITY', 'SEXUAL_CONTENT', 'SLURS'] as const;
export type AutoModKeywordPreset = (typeof AUTOMOD_KEYWORD_PRESETS)[number];

/** Discord's own per-guild cap on KEYWORD rules (docs/resources/auto-moderation). */
export const MAX_KEYWORD_RULES_PER_GUILD = 6;
/** Discord's own per-guild cap on every other trigger type. */
export const MAX_SINGLETON_RULES_PER_GUILD = 1;

export interface AutoModAction {
    type: AutoModActionType;
    /** SEND_ALERT_MESSAGE only. */
    channelId?: string;
    /** TIMEOUT only, seconds, max 2419200 (4 weeks). */
    durationSeconds?: number;
    /** BLOCK_MESSAGE only, max 150 characters. */
    customMessage?: string;
}

/**
 * A fully validated, ready-to-apply rule. `key` is the stable identifier
 * this repo uses to track the rule across runs (see ManagedName.ts) —
 * distinct from `displayName`, which is free text an operator can reword
 * without losing the rule's identity.
 */
export interface AutoModRuleDefinition {
    key: string;
    displayName: string;
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

export interface CommandsOnlyChannelDefinition {
    channelId: string;
    /** Free-text reviewer note — never sent to Discord, purely for `git blame`/PR review. */
    note?: string;
}

export interface AutoModConfig {
    rules: AutoModRuleDefinition[];
    commandsOnlyChannels: CommandsOnlyChannelDefinition[];
}
