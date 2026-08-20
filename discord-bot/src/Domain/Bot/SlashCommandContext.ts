import type { ChatInputCommandInteraction, Client } from 'discord.js';

export interface SlashCommandContext {
    readonly kind: 'chat-input';
    readonly channel_id: string;
    readonly command: string;
    readonly text: string;
    readonly client?: Client;
    readonly interaction: ChatInputCommandInteraction;
}
