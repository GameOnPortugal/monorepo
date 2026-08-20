import type {
    CommunityMessage,
    GuildClient,
    ListMessagesOptions,
    MessageButton,
    RichMessageContent,
} from '../../../Domain/Community/GuildClient.ts';
import { injectable } from 'inversify';
import type { APIMessage, InvalidRequestWarningData, RateLimitData } from 'discord.js';
import {
    REST,
    Routes,
    RESTEvents,
    DiscordAPIError,
    RESTJSONErrorCodes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { CommunityChannels } from '../../../Domain/Community/CommunityChannels.ts';
import { CustomEmoji } from '../../../Domain/Community/CustomEmoji.ts';
import { convertChannel, DISCORD_GUILD_ID } from './DiscordChannels.ts';
import { convertEmoji } from './DiscordEmoji.ts';
import { ClientError } from '../../../Domain/Community/ClientError.ts';
import type Logger from '../../../Application/Logger/Logger.ts';

// REST-only client (M4.5 / A5). The previous implementation lazily built and
// `login()`-ed a *second whole gateway `Client`* on the same bot token and
// never `destroy()`-ed it, so any process that touched GuildClient (the CLI,
// most notably `week-screenshot-winner`) held an open gateway session for its
// entire lifetime. Nothing here — fetching a message, reading its reactions,
// posting a message — needs a gateway connection; it is plain REST, so
// `@discordjs/rest` (re-exported by `discord.js`, no new dependency) is
// enough. `REST`/`Routes`/`RESTEvents` and the `APIMessage` response shape
// all come from that same re-export (`discord.js` does `export * from
// '@discordjs/rest'` and `export * from 'discord-api-types/v10'`).
@injectable()
export class DiscordGuildClient implements GuildClient {
    private readonly rest: REST;

    constructor(
        // `string | undefined`, not `string` with a `?? ''` fallback at the
        // call site (A6): when DISCORD_TOKEN is unset (tests, bin/console.ts
        // without a bot process) this is undefined, and every public method
        // below fails loudly via `requireToken()` instead of silently
        // making an unauthenticated request that would 401 deep inside
        // discord.js with no context.
        private readonly token: string | undefined,
        private readonly logger?: Logger,
    ) {
        this.rest = new REST({ version: '10' }).setToken(this.token ?? '');

        // M4.6: an invalid-request spike or a sustained rate limit is how
        // you find out you're heading for a Cloudflare ban before it
        // happens — wire both into the injected Logger instead of letting
        // @discordjs/rest handle them silently.
        if (this.logger) {
            const logger = this.logger;
            this.rest.on(RESTEvents.RateLimited, (info: RateLimitData) => {
                logger.warn('Discord REST rate limit hit', {
                    route: info.route,
                    method: info.method,
                    timeToReset: info.timeToReset,
                    global: info.global,
                });
            });
            this.rest.on(RESTEvents.InvalidRequestWarning, (info: InvalidRequestWarningData) => {
                logger.warn('Discord REST invalid request warning', {
                    count: info.count,
                    remainingTime: info.remainingTime,
                });
            });
        }
    }

    async getTotalReactionsByEmoji(
        channel: CommunityChannels,
        messageId: string,
        emoji: CustomEmoji,
    ): Promise<number> {
        const discordEmojiId = convertEmoji(emoji);

        const message = await this.fetchRawMessage(channel, messageId);
        const reaction = (message.reactions ?? []).find(
            (candidate) => candidate.emoji.id === discordEmojiId,
        );
        if (!reaction) {
            throw new ClientError('Reaction not found');
        }

        return reaction.count;
    }

    async getMessageUrl(channel: CommunityChannels, messageId: string): Promise<string> {
        // Confirms the message actually exists (and surfaces a ClientError
        // if not), matching the previous gateway-based behaviour, before
        // building the URL. The URL shape itself
        // (`/channels/{guild}/{channel}/{message}`) is exactly what
        // discord.js's `Message#url` produces — this is a single-guild bot,
        // so the guild ID is the configured one rather than something that
        // needs to be read off the message.
        await this.fetchRawMessage(channel, messageId);
        return `https://discord.com/channels/${DISCORD_GUILD_ID}/${convertChannel(channel)}/${messageId}`;
    }

    async sendMessage(channel: CommunityChannels, message: string): Promise<string> {
        this.requireToken();
        const channelId = convertChannel(channel);

        try {
            // No `allowed_mentions` override here: unlike DiscordBot.ts's
            // gateway client (which sets `allowedMentions: { parse: [] }`
            // globally to stop user-supplied text from mass-pinging), the
            // one caller of this method — the weekly winner announcement —
            // intentionally mentions the winning user. Matches the previous
            // gateway-client behaviour, which also had no override.
            const created = (await this.rest.post(Routes.channelMessages(channelId), {
                body: { content: message },
            })) as APIMessage;
            return created.id;
        } catch (error) {
            throw new ClientError(`Failed to send message: ${(error as Error).message}`);
        }
    }

    /** M5.5 — the rich-content counterpart to `sendMessage`; see the port's doc comment. */
    async sendRichMessage(
        channel: CommunityChannels,
        content: RichMessageContent,
    ): Promise<string> {
        this.requireToken();
        const channelId = convertChannel(channel);

        try {
            const created = (await this.rest.post(Routes.channelMessages(channelId), {
                body: buildRichMessageBody(content),
            })) as APIMessage;
            return created.id;
        } catch (error) {
            throw new ClientError(`Failed to send rich message: ${(error as Error).message}`);
        }
    }

    /** M5.6 — re-renders a listing in place; see the port's doc comment. */
    async editRichMessage(
        channelId: string,
        messageId: string,
        content: RichMessageContent,
    ): Promise<void> {
        this.requireToken();

        try {
            await this.rest.patch(Routes.channelMessage(channelId, messageId), {
                body: buildRichMessageBody(content),
            });
        } catch (error) {
            // Unknown Message (10008, HTTP 404): mirrors deleteMessage's
            // tolerance (M5.2) — a message a moderator already removed by
            // hand should not turn an otherwise-successful `EditAd` into a
            // user-facing error, since the row itself was already saved.
            if (
                error instanceof DiscordAPIError &&
                (error.code === RESTJSONErrorCodes.UnknownMessage || error.status === 404)
            ) {
                return;
            }
            throw new ClientError(`Failed to edit rich message: ${(error as Error).message}`);
        }
    }

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        this.requireToken();

        try {
            await this.rest.delete(Routes.channelMessage(channelId, messageId));
        } catch (error) {
            // Unknown Message (10008, HTTP 404): a moderator may already have
            // removed it by hand, or M0.1's orphaned rows point at a message
            // that never had a real id in the first place. Either way this is
            // a successful outcome for the caller (M5.2), not a failure — the
            // desired end state (no message) already holds.
            if (
                error instanceof DiscordAPIError &&
                (error.code === RESTJSONErrorCodes.UnknownMessage || error.status === 404)
            ) {
                return;
            }
            throw new ClientError(`Failed to delete message: ${(error as Error).message}`);
        }
    }

    /**
     * M6.3: the relink job re-fetches a screenshot message by its stored id
     * (population A) to read the freshly-signed image URL Discord hands
     * back off it — `getMessage` is the mapped, public-shaped read for that.
     * `getMessageUrl`/`getTotalReactionsByEmoji` above keep using the raw
     * `fetchRawMessage` since they only need `reactions`, not content or
     * attachments.
     */
    async getMessage(channel: CommunityChannels, messageId: string): Promise<CommunityMessage> {
        return toCommunityMessage(await this.fetchRawMessage(channel, messageId));
    }

    /**
     * One page of `channel`'s history, newest-first — the primitive M6.3's
     * relink job loops with `before` to scan backwards for population B's
     * `ID: #<uuid>` messages. Discord silently caps `limit` at 100
     * regardless of what is asked for, so this does not re-validate it.
     */
    async listMessages(
        channel: CommunityChannels,
        options: ListMessagesOptions,
    ): Promise<CommunityMessage[]> {
        this.requireToken();
        const channelId = convertChannel(channel);

        const query = new URLSearchParams({ limit: String(options.limit) });
        if (options.before) {
            query.set('before', options.before);
        }

        try {
            const messages = (await this.rest.get(Routes.channelMessages(channelId), {
                query,
            })) as APIMessage[];
            return messages.map(toCommunityMessage);
        } catch (error) {
            throw new ClientError(`Failed to list messages: ${(error as Error).message}`);
        }
    }

    async isGuildMember(userId: string): Promise<boolean> {
        this.requireToken();

        try {
            await this.rest.get(Routes.guildMember(DISCORD_GUILD_ID, userId));
            return true;
        } catch (error) {
            // Unknown Member (10007, HTTP 404): the linked Discord account
            // is no longer in the guild — see the port's doc comment. Any
            // other failure (rate limit, auth, network) must not be
            // mistaken for this, so it's rethrown as a ClientError instead
            // of also returning false.
            if (
                error instanceof DiscordAPIError &&
                (error.code === RESTJSONErrorCodes.UnknownMember || error.status === 404)
            ) {
                return false;
            }
            throw new ClientError(`Failed to check guild membership: ${(error as Error).message}`);
        }
    }

    private async fetchRawMessage(
        channel: CommunityChannels,
        messageId: string,
    ): Promise<APIMessage> {
        this.requireToken();
        const channelId = convertChannel(channel);

        try {
            return (await this.rest.get(Routes.channelMessage(channelId, messageId))) as APIMessage;
        } catch (error) {
            throw new ClientError(`Message not found: ${(error as Error).message}`);
        }
    }

    private requireToken(): string {
        if (!this.token) {
            throw new ClientError(
                'DISCORD_TOKEN is not configured; GuildClient cannot call the Discord API',
            );
        }
        return this.token;
    }
}

function toCommunityMessage(message: APIMessage): CommunityMessage {
    return {
        id: message.id,
        content: message.content,
        // Discord snowflakes encode their creation time; `timestamp` is the
        // same value pre-formatted as ISO-8601 by the API, cheaper to trust
        // than decoding the snowflake ourselves.
        createdAt: new Date(message.timestamp),
        attachmentUrls: (message.attachments ?? []).map((attachment) => attachment.url),
        embedImageUrls: (message.embeds ?? [])
            .map((embed) => embed.image?.url)
            .filter((url): url is string => url !== undefined),
    };
}

function mapButtonStyle(style: MessageButton['style']): ButtonStyle {
    switch (style) {
        case 'primary':
            return ButtonStyle.Primary;
        case 'secondary':
            return ButtonStyle.Secondary;
        case 'success':
            return ButtonStyle.Success;
        case 'danger':
            return ButtonStyle.Danger;
    }
}

/**
 * Converts a domain-shaped `RichMessageContent` (M5.5) into the raw
 * `{ embeds, components }` body this REST-only client sends — built via
 * discord.js's `EmbedBuilder`/`ActionRowBuilder`/`ButtonBuilder` and
 * `.toJSON()`-ed, same as every other body this class hand-assembles,
 * rather than constructing the raw API JSON shape by hand.
 */
function buildRichMessageBody(content: RichMessageContent): {
    embeds: unknown[];
    components: unknown[];
} {
    const embed = new EmbedBuilder().setColor(content.color).setTitle(content.title);
    if (content.description) {
        embed.setDescription(content.description);
    }
    if (content.imageUrl) {
        embed.setImage(content.imageUrl);
    }
    if (content.authorName) {
        embed.setAuthor({ name: content.authorName, iconURL: content.authorIconUrl });
    }
    if (content.footerText) {
        embed.setFooter({ text: content.footerText });
    }

    const components: unknown[] = [];
    if (content.buttons && content.buttons.length > 0) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            content.buttons.map((button) => {
                const builder = new ButtonBuilder()
                    .setCustomId(button.customId)
                    .setLabel(button.label)
                    .setStyle(mapButtonStyle(button.style));
                if (button.emoji) {
                    builder.setEmoji(button.emoji);
                }
                return builder;
            }),
        );
        components.push(row.toJSON());
    }

    return { embeds: [embed.toJSON()], components };
}
