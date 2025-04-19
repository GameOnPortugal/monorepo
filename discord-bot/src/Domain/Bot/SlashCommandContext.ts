export interface SlashCommandContext {
    readonly channel_id: string;
    readonly command: string;
    readonly text: string;
    readonly client?: any;
    readonly interaction: any;
}
