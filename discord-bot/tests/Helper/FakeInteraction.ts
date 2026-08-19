/**
 * A hand-rolled fake of the subset of discord.js's ChatInputCommandInteraction
 * that the Marketplace subcommands touch. No mocking library is used in this
 * codebase and none should be introduced (see AGENT.md) — this fixture exists
 * so the discord.js adapter layer can finally be exercised by tests instead of
 * only by hand in production.
 */
export default class FakeInteraction {
    public deferred = false;
    public replied = false;

    public readonly deferReplyCalls: any[] = [];
    public readonly editReplyCalls: any[] = [];
    public readonly followUpCalls: any[] = [];
    public readonly replyCalls: any[] = [];

    /** The payload passed to the last successful editReply/reply call. */
    public lastPostedContent: any = undefined;

    /** When set, the next call to editReply() throws this instead of posting. */
    public failNextEditReplyWith: Error | undefined = undefined;

    public readonly user: { id: string };
    public readonly guildId: string;
    public readonly channelId: string;
    public readonly options: {
        getString: (name: string, required?: boolean) => string | null;
        getUser: (name: string) => { id: string; username: string } | null;
    };

    private messageIdCounter = 0;

    constructor(
        private readonly optionValues: Record<string, string | undefined> = {},
        userId = '111111111111111111',
        channelId = '222222222222222222',
        guildId = '333333333333333333',
        private readonly userOptionValues: Record<
            string,
            { id: string; username: string } | undefined
        > = {},
    ) {
        this.user = { id: userId };
        this.channelId = channelId;
        this.guildId = guildId;
        this.options = {
            getString: (name: string, required?: boolean) => {
                const value = this.optionValues[name];
                if (required && value === undefined) {
                    throw new Error(`FakeInteraction: missing required option "${name}"`);
                }
                return value ?? null;
            },
            getUser: (name: string) => this.userOptionValues[name] ?? null,
        };
    }

    async deferReply(options?: any): Promise<void> {
        this.deferReplyCalls.push(options);
        this.deferred = true;
    }

    async editReply(payload: any): Promise<{ id: string; content: any }> {
        this.editReplyCalls.push(payload);

        if (this.failNextEditReplyWith) {
            const error = this.failNextEditReplyWith;
            this.failNextEditReplyWith = undefined;
            throw error;
        }

        this.replied = true;
        this.lastPostedContent = payload;
        return { id: `fake-message-${++this.messageIdCounter}`, content: payload.content };
    }

    async followUp(payload: any): Promise<{ id: string; content: any }> {
        this.followUpCalls.push(payload);
        return { id: `fake-followup-${++this.messageIdCounter}`, content: payload.content };
    }

    async reply(payload: any): Promise<{ id: string; content: any }> {
        this.replyCalls.push(payload);
        this.replied = true;
        this.lastPostedContent = payload;
        return { id: `fake-message-${++this.messageIdCounter}`, content: payload.content };
    }
}
