import {
    AUTOMOD_ACTION_TYPES,
    AUTOMOD_EVENT_TYPES,
    AUTOMOD_KEYWORD_PRESETS,
    AUTOMOD_TRIGGER_TYPES,
    MAX_KEYWORD_RULES_PER_GUILD,
    MAX_SINGLETON_RULES_PER_GUILD,
    type AutoModAction,
    type AutoModActionType,
    type AutoModConfig,
    type AutoModEventType,
    type AutoModKeywordPreset,
    type AutoModRuleDefinition,
    type AutoModTriggerType,
    type CommandsOnlyChannelDefinition,
} from './AutoModRule.ts';
import { buildManagedRuleName } from './ManagedName.ts';

/**
 * Validates and normalises the checked-in AutoMod config file (M9.1) before
 * anything is ever sent to Discord.
 *
 * Deliberately collects every problem instead of stopping at the first
 * (same shape as `Infrastructure/Config/env.ts`'s `collect()`), and
 * deliberately validates the *entire* file up front rather than rule by
 * rule at apply time — a config with one bad rule must be rejected outright
 * with a useful message, never half-applied while the bad rule silently
 * doesn't make it to Discord.
 */
export interface AutoModConfigParseResult {
    config: AutoModConfig | undefined;
    errors: string[];
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const MAX_KEYWORD_FILTER_ENTRIES = 1000;
const MAX_KEYWORD_LENGTH = 60;
const MAX_REGEX_PATTERNS = 10;
const MAX_REGEX_LENGTH = 260;
const MAX_EXEMPT_ROLES = 20;
const MAX_EXEMPT_CHANNELS = 50;
const MAX_CUSTOM_MESSAGE_LENGTH = 150;
const MAX_TIMEOUT_SECONDS = 2_419_200; // 4 weeks

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function parseAction(raw: unknown, path: string, errors: string[]): AutoModAction | undefined {
    if (!isRecord(raw)) {
        errors.push(`${path} must be an object`);
        return undefined;
    }

    const type = raw.type;
    if (typeof type !== 'string' || !AUTOMOD_ACTION_TYPES.includes(type as AutoModActionType)) {
        errors.push(
            `${path}.type must be one of ${AUTOMOD_ACTION_TYPES.join(', ')}, got ${JSON.stringify(type)}`,
        );
        return undefined;
    }

    const action: AutoModAction = { type: type as AutoModActionType };

    if (type === 'SEND_ALERT_MESSAGE') {
        if (typeof raw.channelId !== 'string' || !SNOWFLAKE_PATTERN.test(raw.channelId)) {
            errors.push(
                `${path}.channelId is required and must be a snowflake for SEND_ALERT_MESSAGE`,
            );
        } else {
            action.channelId = raw.channelId;
        }
    }

    if (type === 'TIMEOUT') {
        if (
            typeof raw.durationSeconds !== 'number' ||
            !Number.isInteger(raw.durationSeconds) ||
            raw.durationSeconds < 1 ||
            raw.durationSeconds > MAX_TIMEOUT_SECONDS
        ) {
            errors.push(
                `${path}.durationSeconds must be an integer between 1 and ${MAX_TIMEOUT_SECONDS} for TIMEOUT`,
            );
        } else {
            action.durationSeconds = raw.durationSeconds;
        }
    }

    if (type === 'BLOCK_MESSAGE' && raw.customMessage !== undefined) {
        if (
            typeof raw.customMessage !== 'string' ||
            raw.customMessage.length > MAX_CUSTOM_MESSAGE_LENGTH
        ) {
            errors.push(
                `${path}.customMessage must be a string of at most ${MAX_CUSTOM_MESSAGE_LENGTH} characters`,
            );
        } else {
            action.customMessage = raw.customMessage;
        }
    }

    return action;
}

function parseRule(
    raw: unknown,
    index: number,
    errors: string[],
): AutoModRuleDefinition | undefined {
    const path = `rules[${index}]`;
    if (!isRecord(raw)) {
        errors.push(`${path} must be an object`);
        return undefined;
    }

    const errorsBefore = errors.length;

    if (typeof raw.key !== 'string' || !KEY_PATTERN.test(raw.key)) {
        errors.push(
            `${path}.key must be a lowercase, hyphenated identifier (max 64 chars, e.g. "starter-keyword-blocklist"), got ${JSON.stringify(raw.key)}`,
        );
    }

    if (typeof raw.displayName !== 'string' || raw.displayName.trim().length === 0) {
        errors.push(`${path}.displayName is required and must be a non-empty string`);
    }

    const enabled = raw.enabled;
    if (typeof enabled !== 'boolean') {
        errors.push(`${path}.enabled must be a boolean`);
    }

    const eventType = raw.eventType;
    if (
        typeof eventType !== 'string' ||
        !AUTOMOD_EVENT_TYPES.includes(eventType as AutoModEventType)
    ) {
        errors.push(`${path}.eventType must be one of ${AUTOMOD_EVENT_TYPES.join(', ')}`);
    }

    const triggerType = raw.triggerType;
    if (
        typeof triggerType !== 'string' ||
        !AUTOMOD_TRIGGER_TYPES.includes(triggerType as AutoModTriggerType)
    ) {
        errors.push(`${path}.triggerType must be one of ${AUTOMOD_TRIGGER_TYPES.join(', ')}`);
    }

    const keywordFilter = raw.keywordFilter ?? [];
    if (!isStringArray(keywordFilter)) {
        errors.push(`${path}.keywordFilter must be an array of strings`);
    } else {
        if (keywordFilter.length > MAX_KEYWORD_FILTER_ENTRIES) {
            errors.push(
                `${path}.keywordFilter has ${keywordFilter.length} entries, max ${MAX_KEYWORD_FILTER_ENTRIES}`,
            );
        }
        const tooLong = keywordFilter.filter((entry) => entry.length > MAX_KEYWORD_LENGTH);
        if (tooLong.length > 0) {
            errors.push(
                `${path}.keywordFilter has entries over ${MAX_KEYWORD_LENGTH} characters: ${tooLong.join(', ')}`,
            );
        }
    }

    const regexPatterns = raw.regexPatterns ?? [];
    if (!isStringArray(regexPatterns)) {
        errors.push(`${path}.regexPatterns must be an array of strings`);
    } else {
        if (regexPatterns.length > MAX_REGEX_PATTERNS) {
            errors.push(
                `${path}.regexPatterns has ${regexPatterns.length} entries, max ${MAX_REGEX_PATTERNS}`,
            );
        }
        const tooLong = regexPatterns.filter((entry) => entry.length > MAX_REGEX_LENGTH);
        if (tooLong.length > 0) {
            errors.push(`${path}.regexPatterns has entries over ${MAX_REGEX_LENGTH} characters`);
        }
    }

    const allowList = raw.allowList ?? [];
    if (!isStringArray(allowList)) {
        errors.push(`${path}.allowList must be an array of strings`);
    }

    const presets = raw.presets ?? [];
    if (
        !Array.isArray(presets) ||
        !presets.every((p) => AUTOMOD_KEYWORD_PRESETS.includes(p as AutoModKeywordPreset))
    ) {
        errors.push(
            `${path}.presets must be an array drawn from ${AUTOMOD_KEYWORD_PRESETS.join(', ')}`,
        );
    }

    if (raw.mentionTotalLimit !== undefined && typeof raw.mentionTotalLimit !== 'number') {
        errors.push(`${path}.mentionTotalLimit must be a number`);
    }

    if (
        raw.mentionRaidProtectionEnabled !== undefined &&
        typeof raw.mentionRaidProtectionEnabled !== 'boolean'
    ) {
        errors.push(`${path}.mentionRaidProtectionEnabled must be a boolean`);
    }

    const exemptRoles = raw.exemptRoles ?? [];
    if (!isStringArray(exemptRoles) || exemptRoles.some((id) => !SNOWFLAKE_PATTERN.test(id))) {
        errors.push(`${path}.exemptRoles must be an array of snowflake role ids`);
    } else if (exemptRoles.length > MAX_EXEMPT_ROLES) {
        errors.push(
            `${path}.exemptRoles has ${exemptRoles.length} entries, max ${MAX_EXEMPT_ROLES}`,
        );
    }

    const exemptChannels = raw.exemptChannels ?? [];
    if (
        !isStringArray(exemptChannels) ||
        exemptChannels.some((id) => !SNOWFLAKE_PATTERN.test(id))
    ) {
        errors.push(`${path}.exemptChannels must be an array of snowflake channel ids`);
    } else if (exemptChannels.length > MAX_EXEMPT_CHANNELS) {
        errors.push(
            `${path}.exemptChannels has ${exemptChannels.length} entries, max ${MAX_EXEMPT_CHANNELS}`,
        );
    }

    const rawActions = raw.actions;
    let actions: AutoModAction[] = [];
    if (!Array.isArray(rawActions) || rawActions.length === 0) {
        errors.push(`${path}.actions must be a non-empty array`);
    } else {
        actions = rawActions
            .map((action, actionIndex) =>
                parseAction(action, `${path}.actions[${actionIndex}]`, errors),
            )
            .filter((action): action is AutoModAction => action !== undefined);
    }

    // KEYWORD/MEMBER_PROFILE rules need at least one thing to actually match on.
    if (
        (triggerType === 'KEYWORD' || triggerType === 'MEMBER_PROFILE') &&
        isStringArray(keywordFilter) &&
        isStringArray(regexPatterns) &&
        keywordFilter.length === 0 &&
        regexPatterns.length === 0
    ) {
        errors.push(
            `${path}: KEYWORD/MEMBER_PROFILE rules need at least one of keywordFilter or regexPatterns`,
        );
    }

    if (triggerType === 'KEYWORD_PRESET' && Array.isArray(presets) && presets.length === 0) {
        errors.push(`${path}: KEYWORD_PRESET rules need at least one entry in presets`);
    }

    if (errors.length > errorsBefore) {
        return undefined;
    }

    return {
        key: raw.key as string,
        displayName: raw.displayName as string,
        enabled: enabled as boolean,
        eventType: eventType as AutoModEventType,
        triggerType: triggerType as AutoModTriggerType,
        keywordFilter: keywordFilter as string[],
        regexPatterns: regexPatterns as string[],
        allowList: allowList as string[],
        presets: presets as AutoModKeywordPreset[],
        mentionTotalLimit: raw.mentionTotalLimit as number | undefined,
        mentionRaidProtectionEnabled: raw.mentionRaidProtectionEnabled as boolean | undefined,
        exemptRoles: exemptRoles as string[],
        exemptChannels: exemptChannels as string[],
        actions,
    };
}

function parseCommandsOnlyChannel(
    raw: unknown,
    index: number,
    errors: string[],
): CommandsOnlyChannelDefinition | undefined {
    const path = `commandsOnlyChannels[${index}]`;
    if (!isRecord(raw)) {
        errors.push(`${path} must be an object`);
        return undefined;
    }

    if (typeof raw.channelId !== 'string' || !SNOWFLAKE_PATTERN.test(raw.channelId)) {
        errors.push(`${path}.channelId must be a snowflake string`);
        return undefined;
    }

    if (raw.note !== undefined && typeof raw.note !== 'string') {
        errors.push(`${path}.note must be a string if present`);
        return undefined;
    }

    return { channelId: raw.channelId, note: raw.note as string | undefined };
}

export function parseAutoModConfig(raw: unknown): AutoModConfigParseResult {
    const errors: string[] = [];

    if (!isRecord(raw)) {
        return { config: undefined, errors: ['config must be a JSON object'] };
    }

    const rawRules = raw.rules;
    if (!Array.isArray(rawRules)) {
        errors.push('rules must be an array');
    }

    const rules: AutoModRuleDefinition[] = Array.isArray(rawRules)
        ? rawRules
              .map((rule, index) => parseRule(rule, index, errors))
              .filter((rule): rule is AutoModRuleDefinition => rule !== undefined)
        : [];

    const rawChannels = raw.commandsOnlyChannels ?? [];
    if (!Array.isArray(rawChannels)) {
        errors.push('commandsOnlyChannels must be an array');
    }

    const commandsOnlyChannels: CommandsOnlyChannelDefinition[] = Array.isArray(rawChannels)
        ? rawChannels
              .map((channel, index) => parseCommandsOnlyChannel(channel, index, errors))
              .filter((channel): channel is CommandsOnlyChannelDefinition => channel !== undefined)
        : [];

    // Only run the cross-rule checks below once every individual rule parsed
    // cleanly — a malformed rule already means the file is rejected, and
    // duplicate/limit checks on a partially-parsed list would be noise.
    if (errors.length === 0) {
        const seenKeys = new Set<string>();
        for (const rule of rules) {
            if (seenKeys.has(rule.key)) {
                errors.push(`rules: duplicate key "${rule.key}" — keys must be unique`);
            }
            seenKeys.add(rule.key);

            // Discord's own name-length limit applies to the *managed* name
            // (marker + key + displayName), not just displayName — catch an
            // over-length name here rather than at apply time.
            try {
                buildManagedRuleName(rule.key, rule.displayName);
            } catch (error) {
                errors.push((error as Error).message);
            }
        }

        const seenChannelIds = new Set<string>();
        for (const channel of commandsOnlyChannels) {
            if (seenChannelIds.has(channel.channelId)) {
                errors.push(`commandsOnlyChannels: duplicate channelId "${channel.channelId}"`);
            }
            seenChannelIds.add(channel.channelId);
        }

        const keywordRuleCount = rules.filter((rule) => rule.triggerType === 'KEYWORD').length;
        if (keywordRuleCount > MAX_KEYWORD_RULES_PER_GUILD) {
            errors.push(
                `rules: ${keywordRuleCount} KEYWORD rules configured, Discord allows at most ${MAX_KEYWORD_RULES_PER_GUILD} per guild`,
            );
        }
        for (const triggerType of AUTOMOD_TRIGGER_TYPES) {
            if (triggerType === 'KEYWORD') continue;
            const count = rules.filter((rule) => rule.triggerType === triggerType).length;
            if (count > MAX_SINGLETON_RULES_PER_GUILD) {
                errors.push(
                    `rules: ${count} ${triggerType} rules configured, Discord allows at most ${MAX_SINGLETON_RULES_PER_GUILD} per guild`,
                );
            }
        }
    }

    if (errors.length > 0) {
        return { config: undefined, errors };
    }

    return { config: { rules, commandsOnlyChannels }, errors: [] };
}
