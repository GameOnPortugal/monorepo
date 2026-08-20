import type { CustomEmoji } from './CustomEmoji.ts';
import type { CommunityChannels } from './CommunityChannels.ts';

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
}
