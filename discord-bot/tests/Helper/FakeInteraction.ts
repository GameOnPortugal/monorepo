import type { ChatInputCommandInteraction } from 'discord.js';

/**
 * A hand-rolled fake of the subset of discord.js's ChatInputCommandInteraction
 * that the Marketplace/Screenshot/Trophy subcommands touch. No mocking library
 * is used in this codebase and none should be introduced (see AGENT.md) — this
 * fixture exists so the discord.js adapter layer can finally be exercised by
 * tests instead of only by hand in production.
 *
 * `SlashCommandContext.interaction` is typed as the real
 * `ChatInputCommandInteraction` (M4.1), which this fake does not — and
 * structurally cannot, since discord.js interaction classes carry private
 * fields — implement. Call sites cast via `asChatInputCommandInteraction()`,
 * the one deliberate, documented `as unknown as` in this fixture.
 */
export default class FakeInteraction {
    public deferred = false;
    public replied = false;

    public readonly deferReplyCalls: any[] = [];
    public readonly editReplyCalls: any[] = [];
    public readonly followUpCalls: any[] = [];
    public readonly replyCalls: any[] = [];
    public readonly deleteReplyCalls: any[] = [];

    /** The payload passed to the last successful editReply/reply call. */
    public lastPostedContent: any = undefined;

    /** When set, the next call to editReply() throws this instead of posting. */
    public failNextEditReplyWith: Error | undefined = undefined;

    public readonly user: { id: string; username: string };
    public readonly guildId: string;
    public readonly guild: { id: string } | null;
    public readonly member: { permissions: string } | null;
    public readonly channelId: string;
    public readonly id: string;
    public readonly showModalCalls: any[] = [];
    public readonly options: {
        getString: (name: string, required?: boolean) => string | null;
        getUser: (name: string) => { id: string; username: string } | null;
        getInteger: (name: string, required?: boolean) => number | null;
        getAttachment: (
            name: string,
            required?: boolean,
        ) => { contentType: string | null; url: string } | null;
        getSubcommand: () => string;
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
        private readonly integerOptionValues: Record<string, number | undefined> = {},
        private readonly attachmentOptionValues: Record<
            string,
            { contentType: string | null; url: string } | undefined
        > = {},
        private readonly subcommand: string = '',
        username = 'test-user',
        interactionId = 'fake-interaction-1',
        // M5.6 addition — the raw HTTP-interaction bitfield string
        // `isGuildAdmin()` (Domain/Bot/AdminCheck.ts) knows how to read;
        // '0' is "no permissions", matching a regular member.
        permissions = '0',
    ) {
        this.user = { id: userId, username };
        this.channelId = channelId;
        this.guildId = guildId;
        this.guild = { id: guildId };
        this.member = { permissions };
        this.id = interactionId;
        this.options = {
            getString: (name: string, required?: boolean) => {
                const value = this.optionValues[name];
                if (required && value === undefined) {
                    throw new Error(`FakeInteraction: missing required option "${name}"`);
                }
                return value ?? null;
            },
            getUser: (name: string) => this.userOptionValues[name] ?? null,
            getInteger: (name: string, required?: boolean) => {
                const value = this.integerOptionValues[name];
                if (required && value === undefined) {
                    throw new Error(`FakeInteraction: missing required option "${name}"`);
                }
                return value ?? null;
            },
            getAttachment: (name: string, required?: boolean) => {
                const value = this.attachmentOptionValues[name];
                if (required && value === undefined) {
                    throw new Error(`FakeInteraction: missing required option "${name}"`);
                }
                return value ?? null;
            },
            getSubcommand: () => this.subcommand,
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
        // Real discord.js sets replied=true after followUp() too (it counts
        // as "the interaction has been responded to"), not just after reply().
        this.replied = true;
        return { id: `fake-followup-${++this.messageIdCounter}`, content: payload.content };
    }

    async deleteReply(message?: unknown): Promise<void> {
        this.deleteReplyCalls.push(message);
    }

    /**
     * M5.6 — `EditAdSubcommand` opens a modal rather than deferring/replying
     * normally. `showModal()` is itself the interaction's acknowledgement
     * (Discord does not allow both), so this marks `replied` the same way
     * `reply()` does.
     */
    async showModal(modal: any): Promise<void> {
        this.showModalCalls.push(modal);
        this.replied = true;
    }

    async reply(payload: any): Promise<{ id: string; content: any }> {
        this.replyCalls.push(payload);
        this.replied = true;
        this.lastPostedContent = payload;
        return { id: `fake-message-${++this.messageIdCounter}`, content: payload.content };
    }

    /**
     * The one deliberate cast in this fixture: discord.js's interaction
     * classes carry private fields (e.g. `BaseInteraction#_cacheType`), so no
     * plain object can structurally satisfy `ChatInputCommandInteraction` —
     * a cast is genuinely unavoidable to hand this fake to code typed
     * against the real interaction.
     */
    asChatInputCommandInteraction(): ChatInputCommandInteraction {
        return this as unknown as ChatInputCommandInteraction;
    }
}
