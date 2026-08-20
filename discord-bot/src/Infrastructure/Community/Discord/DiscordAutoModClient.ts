import { injectable } from 'inversify';
import type {
    APIAutoModerationAction,
    APIAutoModerationRule,
    InvalidRequestWarningData,
    RateLimitData,
} from 'discord.js';
import {
    AutoModerationActionType,
    AutoModerationRuleEventType,
    AutoModerationRuleKeywordPresetType,
    AutoModerationRuleTriggerType,
    DiscordAPIError,
    REST,
    RESTEvents,
    Routes,
} from 'discord.js';
import type {
    AutoModClient,
    ChannelPermissionOverwrite,
    RemoteAutoModRule,
} from '../../../Domain/Community/AutoModClient.ts';
import type {
    AutoModAction,
    AutoModRuleDefinition,
} from '../../../Domain/Moderation/AutoModRule.ts';
import { buildManagedRuleName } from '../../../Domain/Moderation/ManagedName.ts';
import { ClientError } from '../../../Domain/Community/ClientError.ts';
import { DISCORD_GUILD_ID } from './DiscordChannels.ts';
import type Logger from '../../../Application/Logger/Logger.ts';

const EVENT_TYPE_TO_API: Record<string, AutoModerationRuleEventType> = {
    MESSAGE_SEND: AutoModerationRuleEventType.MessageSend,
    MEMBER_UPDATE: AutoModerationRuleEventType.MemberUpdate,
};
const EVENT_TYPE_FROM_API: Record<number, string> = {
    [AutoModerationRuleEventType.MessageSend]: 'MESSAGE_SEND',
    [AutoModerationRuleEventType.MemberUpdate]: 'MEMBER_UPDATE',
};

const TRIGGER_TYPE_TO_API: Record<string, AutoModerationRuleTriggerType> = {
    KEYWORD: AutoModerationRuleTriggerType.Keyword,
    SPAM: AutoModerationRuleTriggerType.Spam,
    KEYWORD_PRESET: AutoModerationRuleTriggerType.KeywordPreset,
    MENTION_SPAM: AutoModerationRuleTriggerType.MentionSpam,
    MEMBER_PROFILE: AutoModerationRuleTriggerType.MemberProfile,
};
const TRIGGER_TYPE_FROM_API: Record<number, string> = {
    [AutoModerationRuleTriggerType.Keyword]: 'KEYWORD',
    [AutoModerationRuleTriggerType.Spam]: 'SPAM',
    [AutoModerationRuleTriggerType.KeywordPreset]: 'KEYWORD_PRESET',
    [AutoModerationRuleTriggerType.MentionSpam]: 'MENTION_SPAM',
    [AutoModerationRuleTriggerType.MemberProfile]: 'MEMBER_PROFILE',
};

const ACTION_TYPE_TO_API: Record<string, AutoModerationActionType> = {
    BLOCK_MESSAGE: AutoModerationActionType.BlockMessage,
    SEND_ALERT_MESSAGE: AutoModerationActionType.SendAlertMessage,
    TIMEOUT: AutoModerationActionType.Timeout,
    BLOCK_MEMBER_INTERACTION: AutoModerationActionType.BlockMemberInteraction,
};
const ACTION_TYPE_FROM_API: Record<number, string> = {
    [AutoModerationActionType.BlockMessage]: 'BLOCK_MESSAGE',
    [AutoModerationActionType.SendAlertMessage]: 'SEND_ALERT_MESSAGE',
    [AutoModerationActionType.Timeout]: 'TIMEOUT',
    [AutoModerationActionType.BlockMemberInteraction]: 'BLOCK_MEMBER_INTERACTION',
};

const PRESET_TO_API: Record<string, AutoModerationRuleKeywordPresetType> = {
    PROFANITY: AutoModerationRuleKeywordPresetType.Profanity,
    SEXUAL_CONTENT: AutoModerationRuleKeywordPresetType.SexualContent,
    SLURS: AutoModerationRuleKeywordPresetType.Slurs,
};
const PRESET_FROM_API: Record<number, string> = {
    [AutoModerationRuleKeywordPresetType.Profanity]: 'PROFANITY',
    [AutoModerationRuleKeywordPresetType.SexualContent]: 'SEXUAL_CONTENT',
    [AutoModerationRuleKeywordPresetType.Slurs]: 'SLURS',
};

/** `type: 0` in Discord's permission-overwrite object means "this overwrite targets a role", as opposed to `1` for a member. `@everyone`'s role id is always the guild id. */
const OVERWRITE_TYPE_ROLE = 0;

function toApiAction(action: AutoModAction): APIAutoModerationAction {
    const type = ACTION_TYPE_TO_API[action.type];
    if (type === undefined) {
        throw new ClientError(`Unknown AutoMod action type: ${action.type}`);
    }

    if (type === AutoModerationActionType.BlockMessage) {
        return {
            type,
            metadata:
                action.customMessage !== undefined
                    ? { custom_message: action.customMessage }
                    : undefined,
        };
    }
    if (type === AutoModerationActionType.SendAlertMessage) {
        return { type, metadata: { channel_id: action.channelId ?? '' } };
    }
    if (type === AutoModerationActionType.Timeout) {
        return { type, metadata: { duration_seconds: action.durationSeconds ?? 0 } };
    }
    return { type };
}

function fromApiAction(action: APIAutoModerationAction): AutoModAction {
    const type = ACTION_TYPE_FROM_API[action.type];
    if (!type) {
        throw new ClientError(
            `Discord returned an unrecognised AutoMod action type: ${action.type}`,
        );
    }

    return {
        type: type as AutoModAction['type'],
        channelId: action.metadata?.channel_id,
        durationSeconds: action.metadata?.duration_seconds,
        customMessage: action.metadata?.custom_message,
    };
}

function toRuleBody(definition: AutoModRuleDefinition) {
    const eventType = EVENT_TYPE_TO_API[definition.eventType];
    const triggerType = TRIGGER_TYPE_TO_API[definition.triggerType];
    if (eventType === undefined || triggerType === undefined) {
        throw new ClientError(
            `Unknown AutoMod eventType/triggerType: ${definition.eventType}/${definition.triggerType}`,
        );
    }

    return {
        name: buildManagedRuleName(definition.key, definition.displayName),
        event_type: eventType,
        trigger_type: triggerType,
        trigger_metadata: {
            keyword_filter: definition.keywordFilter,
            regex_patterns: definition.regexPatterns,
            allow_list: definition.allowList,
            presets: definition.presets.map((preset) => {
                const value = PRESET_TO_API[preset];
                if (value === undefined) throw new ClientError(`Unknown AutoMod preset: ${preset}`);
                return value;
            }),
            mention_total_limit: definition.mentionTotalLimit,
            mention_raid_protection_enabled: definition.mentionRaidProtectionEnabled,
        },
        actions: definition.actions.map(toApiAction),
        enabled: definition.enabled,
        exempt_roles: definition.exemptRoles,
        exempt_channels: definition.exemptChannels,
    };
}

function fromApiRule(rule: APIAutoModerationRule): RemoteAutoModRule {
    const eventType = EVENT_TYPE_FROM_API[rule.event_type];
    const triggerType = TRIGGER_TYPE_FROM_API[rule.trigger_type];
    if (!eventType || !triggerType) {
        throw new ClientError(
            `Discord returned an unrecognised AutoMod eventType/triggerType: ${rule.event_type}/${rule.trigger_type}`,
        );
    }

    return {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        eventType: eventType as RemoteAutoModRule['eventType'],
        triggerType: triggerType as RemoteAutoModRule['triggerType'],
        keywordFilter: rule.trigger_metadata?.keyword_filter ?? [],
        regexPatterns: rule.trigger_metadata?.regex_patterns ?? [],
        allowList: rule.trigger_metadata?.allow_list ?? [],
        presets: (rule.trigger_metadata?.presets ?? []).map((preset) => {
            const value = PRESET_FROM_API[preset];
            if (!value)
                throw new ClientError(`Discord returned an unrecognised AutoMod preset: ${preset}`);
            return value as RemoteAutoModRule['presets'][number];
        }),
        mentionTotalLimit: rule.trigger_metadata?.mention_total_limit,
        mentionRaidProtectionEnabled: rule.trigger_metadata?.mention_raid_protection_enabled,
        exemptRoles: rule.exempt_roles ?? [],
        exemptChannels: rule.exempt_channels ?? [],
        actions: rule.actions.map(fromApiAction),
    };
}

/**
 * REST-only implementation of `AutoModClient` (M9.1), same pattern as
 * `DiscordGuildClient` (M4.5): no gateway connection, `@discordjs/rest`
 * re-exported from `discord.js`, and every public method fails fast via
 * `requireToken()` when `DISCORD_TOKEN` is unset instead of making an
 * unauthenticated request.
 */
@injectable()
export class DiscordAutoModClient implements AutoModClient {
    private readonly rest: REST;

    constructor(
        private readonly token: string | undefined,
        private readonly logger?: Logger,
    ) {
        this.rest = new REST({ version: '10' }).setToken(this.token ?? '');

        if (this.logger) {
            const logger = this.logger;
            this.rest.on(RESTEvents.RateLimited, (info: RateLimitData) => {
                logger.warn('Discord REST rate limit hit (AutoMod)', {
                    route: info.route,
                    method: info.method,
                    timeToReset: info.timeToReset,
                    global: info.global,
                });
            });
            this.rest.on(RESTEvents.InvalidRequestWarning, (info: InvalidRequestWarningData) => {
                logger.warn('Discord REST invalid request warning (AutoMod)', {
                    count: info.count,
                    remainingTime: info.remainingTime,
                });
            });
        }
    }

    async listRules(): Promise<RemoteAutoModRule[]> {
        this.requireToken();

        try {
            const rules = (await this.rest.get(
                Routes.guildAutoModerationRules(DISCORD_GUILD_ID),
            )) as APIAutoModerationRule[];
            return rules.map(fromApiRule);
        } catch (error) {
            throw new ClientError(`Failed to list AutoMod rules: ${(error as Error).message}`);
        }
    }

    async createRule(definition: AutoModRuleDefinition): Promise<RemoteAutoModRule> {
        this.requireToken();

        try {
            const created = (await this.rest.post(
                Routes.guildAutoModerationRules(DISCORD_GUILD_ID),
                {
                    body: toRuleBody(definition),
                },
            )) as APIAutoModerationRule;
            return fromApiRule(created);
        } catch (error) {
            throw new ClientError(
                `Failed to create AutoMod rule "${definition.key}": ${(error as Error).message}`,
            );
        }
    }

    async updateRule(
        remoteId: string,
        definition: AutoModRuleDefinition,
    ): Promise<RemoteAutoModRule> {
        this.requireToken();

        try {
            const updated = (await this.rest.patch(
                Routes.guildAutoModerationRule(DISCORD_GUILD_ID, remoteId),
                { body: toRuleBody(definition) },
            )) as APIAutoModerationRule;
            return fromApiRule(updated);
        } catch (error) {
            throw new ClientError(
                `Failed to update AutoMod rule "${definition.key}" (${remoteId}): ${(error as Error).message}`,
            );
        }
    }

    async deleteRule(remoteId: string): Promise<void> {
        this.requireToken();

        try {
            await this.rest.delete(Routes.guildAutoModerationRule(DISCORD_GUILD_ID, remoteId));
        } catch (error) {
            // Unknown Auto Moderation Rule (404): already gone — a moderator
            // may have deleted it by hand. Same idempotency stance as
            // DiscordGuildClient.deleteMessage.
            if (error instanceof DiscordAPIError && error.status === 404) {
                return;
            }
            throw new ClientError(
                `Failed to delete AutoMod rule ${remoteId}: ${(error as Error).message}`,
            );
        }
    }

    async getEveryoneChannelOverwrite(
        channelId: string,
    ): Promise<ChannelPermissionOverwrite | null> {
        this.requireToken();

        try {
            const channel = (await this.rest.get(Routes.channel(channelId))) as {
                permission_overwrites?: Array<{
                    id: string;
                    type: number;
                    allow: string;
                    deny: string;
                }>;
            };
            const everyone = (channel.permission_overwrites ?? []).find(
                (overwrite) =>
                    overwrite.id === DISCORD_GUILD_ID && overwrite.type === OVERWRITE_TYPE_ROLE,
            );
            if (!everyone) {
                return null;
            }
            return { allow: BigInt(everyone.allow), deny: BigInt(everyone.deny) };
        } catch (error) {
            throw new ClientError(
                `Failed to read channel ${channelId}'s permissions: ${(error as Error).message}`,
            );
        }
    }

    async putEveryoneChannelOverwrite(
        channelId: string,
        overwrite: ChannelPermissionOverwrite,
    ): Promise<void> {
        this.requireToken();

        try {
            await this.rest.put(Routes.channelPermission(channelId, DISCORD_GUILD_ID), {
                body: {
                    allow: overwrite.allow.toString(),
                    deny: overwrite.deny.toString(),
                    type: OVERWRITE_TYPE_ROLE,
                },
            });
        } catch (error) {
            throw new ClientError(
                `Failed to set @everyone permissions on channel ${channelId}: ${(error as Error).message}`,
            );
        }
    }

    private requireToken(): string {
        if (!this.token) {
            throw new ClientError(
                'DISCORD_TOKEN is not configured; AutoModClient cannot call the Discord API',
            );
        }
        return this.token;
    }
}
