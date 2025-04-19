import type {GuildClient} from "../../../Domain/Community/GuildClient.ts";
import {injectable} from "inversify";
import {Client, type Message, TextChannel} from 'discord.js';
import {CommunityChannels} from "../../../Domain/Community/CommunityChannels.ts";
import {CustomEmoji} from "../../../Domain/Community/CustomEmoji.ts";
import {convertChannel} from "./DiscordChannels.ts";
import {convertEmoji} from "./DiscordEmoji.ts";
import {ClientError} from "../../../Domain/Community/ClientError.ts";

@injectable()
export class DiscordGuildClient implements GuildClient {
    private client: Client|undefined = undefined;

    constructor(
        private readonly token: string,
    ) {
    }

    async getTotalReactionsByEmoji(channel: CommunityChannels, messageId: string, emoji: CustomEmoji): Promise<number> {
        const discordEmoji = convertEmoji(emoji);

        const message = await this.getMessage(channel, messageId);
        const reactions = message.reactions.cache
            .filter(reaction => reaction.emoji.id === discordEmoji);
        const reaction = reactions.first();
        if (!reaction) {
            throw new ClientError('Reaction not found');
        }

        return reaction.count;
    }

    async getMessageUrl(channel: CommunityChannels, messageId: string): Promise<string> {
        const message = await this.getMessage(channel, messageId);
        return message.url;
    }

    async sendMessage(channel: CommunityChannels, message: string): Promise<string> {
        const client = await this.getClient();
        const discordChannel = await client.channels.fetch(convertChannel(channel));

        if (!discordChannel?.isTextBased()) {
            throw new ClientError('Channel not found or is not a text channel');
        }

        const sentMessage = await (discordChannel as TextChannel).send(message);
        return sentMessage.id;
    }

    private async getMessage(channel: CommunityChannels, messageId: string): Promise<Message> {
        const client = await this.getClient();
        const discordChannel = await client.channels.fetch(convertChannel(channel))

        if (!discordChannel?.isTextBased()) {
            throw new ClientError('Channel not found or is not a text channel')
        }
        const message = await discordChannel.messages.fetch(messageId);
        if (!message) {
            throw new ClientError('Message not found')
        }

        return message;
    }

    private async getClient(): Promise<Client> {
        if (this.client === undefined) {
            this.client = new Client({ intents: [] });
            await this.client.login(this.token);
        }

        return this.client;
    }
}
