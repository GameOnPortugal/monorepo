import type { CustomEmoji } from './CustomEmoji.ts';
import type { CommunityChannels } from './CommunityChannels.ts';

/**
 * The subset of a Discord message the bot ever needs to read back — added
 * for M6.3's screenshot relink job, which has to (a) re-fetch a message by
 * its stored id and read the live, freshly-signed image URL Discord hands
 * back off it (population A — see RelinkScreenshotsJob.ts), and (b) page
 * through channel history looking for a message whose `content` embeds a
 * screenshot's UUID (population B, whose stored message id is wrong and
 * unusable). Deliberately just the fields those two things need, not a
 * general-purpose message mirror.
 */
export interface CommunityMessage {
    id: string;
    content: string;
    createdAt: Date;
    /** Attachment URLs, in the order Discord returned them. */
    attachmentUrls: string[];
    /** `embed.image.url` for every embed that has one, in embed order — never thumbnails. */
    embedImageUrls: string[];
}

export interface ListMessagesOptions {
    /** Discord's own pagination cursor: only messages older than this id. Omit for the newest page. */
    before?: string;
    /** Capped at 100 by Discord's API regardless of what is asked for. */
    limit: number;
}

export interface GuildClient {
    getTotalReactionsByEmoji(
        channel: CommunityChannels,
        messageId: string,
        emoji: CustomEmoji,
    ): Promise<number>;

    getMessageUrl(channel: CommunityChannels, messageId: string): Promise<string>;

    sendMessage(channel: CommunityChannels, message: string): Promise<string>;

    /**
     * Deletes a previously-posted message.
     *
     * Unlike the methods above, this takes a **raw channel id**, not a
     * `CommunityChannels` member. Those methods target a single well-known
     * channel this bot manages (screenshots, marketplace, admin); this one
     * targets wherever a specific, already-persisted message actually lives
     * — for marketplace ads that is *usually* the marketplace channel, but
     * docs/known-issues.md #20 recorded eight production ads that ended up
     * posted somewhere else entirely before M5.1 fixed the write path.
     * Deleting by the row's own stored `channel_id` is what makes those
     * historical rows cleanable too, not just ads created from here on.
     *
     * Idempotent by design (M5.2): a message a moderator already removed by
     * hand, or one whose `channel_id`/`message_id` never pointed at a real
     * message in the first place (M0.1's orphaned rows), is a successful
     * outcome, not an error — callers should never have a user-facing delete
     * fail just because the Discord side of it was already gone.
     */
    deleteMessage(channelId: string, messageId: string): Promise<void>;

    /**
     * @throws ClientError if the message cannot be found or read.
     */
    getMessage(channel: CommunityChannels, messageId: string): Promise<CommunityMessage>;

    /**
     * One page of channel history, newest-first, exactly as Discord's own
     * API paginates. The caller is responsible for looping with `before`
     * and for deciding how far back is far enough — this method does not
     * loop or bound anything on its own.
     */
    listMessages(
        channel: CommunityChannels,
        options: ListMessagesOptions,
    ): Promise<CommunityMessage[]>;
}
