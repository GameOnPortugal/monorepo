import { injectable } from 'inversify';
import type { GuildClient } from '../../../Domain/Community/GuildClient.ts';
import { CommunityChannels } from '../../../Domain/Community/CommunityChannels.ts';
import { CustomEmoji } from '../../../Domain/Community/CustomEmoji.ts';
import { ClientError } from '../../../Domain/Community/ClientError.ts';

interface InMemoryMessage {
    reactions: Partial<Record<CustomEmoji, number>>;
}

export interface SentMessage {
    channel: CommunityChannels;
    message: string;
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

    /** Registers a message so it can be "found" by the methods below. */
    registerMessage(messageId: string, reactions: Partial<Record<CustomEmoji, number>> = {}): void {
        this.messages.set(messageId, { reactions });
    }

    /** Simulates a message that used to exist but has since vanished. */
    forgetMessage(messageId: string): void {
        this.messages.delete(messageId);
    }

    reset(): void {
        this.messages.clear();
        this.sentMessages.length = 0;
        this.nextMessageId = 1;
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
        const messageId = `in-memory-${this.nextMessageId++}`;
        this.sentMessages.push({ channel, message });
        this.messages.set(messageId, { reactions: {} });

        return messageId;
    }
}
