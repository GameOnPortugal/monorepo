import { injectable } from 'inversify';
import type { GuildClient } from '../../../Domain/Community/GuildClient.ts';
import { CommunityChannels } from '../../../Domain/Community/CommunityChannels.ts';
import { CustomEmoji } from '../../../Domain/Community/CustomEmoji.ts';
import { ClientError } from '../../../Domain/Community/ClientError.ts';
import type { DirectMessagePayload } from '../../../Domain/Community/DirectMessage.ts';

interface InMemoryMessage {
    reactions: Partial<Record<CustomEmoji, number>>;
}

export interface SentMessage {
    channel: CommunityChannels;
    message: string;
}

export interface DeletedMessage {
    channelId: string;
    messageId: string;
}

export interface SentDirectMessage {
    userId: string;
    message: DirectMessagePayload;
}

/**
 * Test/no-token stand-in for `DiscordGuildClient`, mirroring `InMemoryClient`
 * (the equivalent stand-in for `Bot`): bound automatically when
 * `DISCORD_TOKEN` is unset, so the container never has to reach Discord's
 * network to resolve. Also doubles as the hand-rolled fake used by
 * integration tests that need to observe what a job *would have* sent
 * (M6.4) — there is no mocking library in this repo, so this records real
 * state instead of stubbing method calls.
 */
@injectable()
export class InMemoryGuildClient implements GuildClient {
    private readonly messages = new Map<string, InMemoryMessage>();
    private nextMessageId = 1;
    public readonly sentMessages: SentMessage[] = [];
    public readonly deletedMessages: DeletedMessage[] = [];
    public readonly sentDirectMessages: SentDirectMessage[] = [];
    private readonly closedDmUsers = new Set<string>();

    /** When set, the next call to sendMessage() throws this instead of posting. */
    public failNextSendWith: Error | undefined = undefined;

    /** Registers a message so it can be "found" by the methods below. */
    registerMessage(messageId: string, reactions: Partial<Record<CustomEmoji, number>> = {}): void {
        this.messages.set(messageId, { reactions });
    }

    /** Simulates a message that used to exist but has since vanished. */
    forgetMessage(messageId: string): void {
        this.messages.delete(messageId);
    }

    /**
     * Simulates a user with DMs closed (privacy settings, or having blocked
     * the bot) — `sendDirectMessage` returns `null` for them instead of
     * recording anything, mirroring `DiscordGuildClient`'s 50007/10013
     * handling.
     */
    closeDmFor(userId: string): void {
        this.closedDmUsers.add(userId);
    }

    reset(): void {
        this.messages.clear();
        this.sentMessages.length = 0;
        this.deletedMessages.length = 0;
        this.sentDirectMessages.length = 0;
        this.closedDmUsers.clear();
        this.nextMessageId = 1;
        this.failNextSendWith = undefined;
    }

    async getTotalReactionsByEmoji(
        _channel: CommunityChannels,
        messageId: string,
        emoji: CustomEmoji,
    ): Promise<number> {
        const message = this.messages.get(messageId);
        if (!message) {
            throw new ClientError(`Message "${messageId}" not found`);
        }

        return message.reactions[emoji] ?? 0;
    }

    async getMessageUrl(channel: CommunityChannels, messageId: string): Promise<string> {
        const message = this.messages.get(messageId);
        if (!message) {
            throw new ClientError(`Message "${messageId}" not found`);
        }

        return `https://discord.com/channels/in-memory/${channel}/${messageId}`;
    }

    async sendMessage(channel: CommunityChannels, message: string): Promise<string> {
        if (this.failNextSendWith) {
            const error = this.failNextSendWith;
            this.failNextSendWith = undefined;
            throw error;
        }

        const messageId = `in-memory-${this.nextMessageId++}`;
        this.sentMessages.push({ channel, message });
        this.messages.set(messageId, { reactions: {} });

        return messageId;
    }

    /**
     * Mirrors `DiscordGuildClient.deleteMessage`'s idempotency (M5.2): a
     * `messageId` this fake never registered (or already forgot) is treated
     * the same way a real 404/Unknown Message is — a no-op, not a throw. Also
     * mirrors the real client in taking a raw channel id rather than a
     * `CommunityChannels` member — see the port's doc comment.
     */
    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        this.messages.delete(messageId);
        this.deletedMessages.push({ channelId, messageId });
    }

    async sendDirectMessage(userId: string, message: DirectMessagePayload): Promise<string | null> {
        if (this.closedDmUsers.has(userId)) {
            return null;
        }

        if (this.failNextSendWith) {
            const error = this.failNextSendWith;
            this.failNextSendWith = undefined;
            throw error;
        }

        const messageId = `in-memory-dm-${this.nextMessageId++}`;
        this.sentDirectMessages.push({ userId, message });
        this.messages.set(messageId, { reactions: {} });

        return messageId;
    }

    async messageExists(_channelId: string, messageId: string): Promise<boolean> {
        return this.messages.has(messageId);
    }
}
