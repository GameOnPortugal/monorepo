import type {CustomEmoji} from "./CustomEmoji.ts";
import type {CommunityChannels} from "./CommunityChannels.ts";

export interface GuildClient {
    getTotalReactionsByEmoji(channel: CommunityChannels, messageId: string, emoji: CustomEmoji): Promise<number>

    getMessageUrl(channel: CommunityChannels, messageId: string): Promise<string>;

    sendMessage(channel: CommunityChannels, message: string): Promise<string>;
}