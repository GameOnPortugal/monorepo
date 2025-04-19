export interface MentionContext {
    event: {
        text: string;
        originalText: string; // With bot mention <@...>
        channel: string;
        threadTs: string;
        userId?: string;
        teamId?: string;
    },
    client: any,

    reply: (text: string) => Promise<void>;
}
