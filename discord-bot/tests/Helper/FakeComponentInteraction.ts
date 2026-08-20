import type { ButtonInteraction } from 'discord.js';

/**
 * The subset of `ButtonInteraction` that `BotExecutor.executeComponent()` and
 * the component handlers it dispatches to actually touch (M4.7) — same
 * hand-rolled style as {@link FakeInteraction}.
 */
export default class FakeComponentInteraction {
    public deferred = false;
    public replied = false;

    public readonly deferReplyCalls: any[] = [];
    public readonly deferUpdateCalls: any[] = [];
    public readonly editReplyCalls: any[] = [];
    public readonly followUpCalls: any[] = [];
    public readonly replyCalls: any[] = [];
    public readonly updateCalls: any[] = [];

    public readonly user: { id: string; username: string };
    public readonly customId: string;
    public readonly channelId: string;
    public readonly guildId: string;

    private messageIdCounter = 0;

    constructor(
        customId: string,
        userId = '111111111111111111',
        channelId = '222222222222222222',
        guildId = '333333333333333333',
        username = 'test-user',
    ) {
        this.customId = customId;
        this.user = { id: userId, username };
        this.channelId = channelId;
        this.guildId = guildId;
    }

    async deferReply(options?: any): Promise<void> {
        this.deferReplyCalls.push(options);
        this.deferred = true;
    }

    async deferUpdate(options?: any): Promise<void> {
        this.deferUpdateCalls.push(options);
        this.deferred = true;
    }

    async editReply(payload: any): Promise<{ id: string }> {
        this.editReplyCalls.push(payload);
        this.replied = true;
        return { id: `fake-message-${++this.messageIdCounter}` };
    }

    async followUp(payload: any): Promise<{ id: string }> {
        this.followUpCalls.push(payload);
        this.replied = true;
        return { id: `fake-followup-${++this.messageIdCounter}` };
    }

    async reply(payload: any): Promise<{ id: string }> {
        this.replyCalls.push(payload);
        this.replied = true;
        return { id: `fake-message-${++this.messageIdCounter}` };
    }

    async update(payload: any): Promise<{ id: string }> {
        this.updateCalls.push(payload);
        this.replied = true;
        return { id: `fake-message-${++this.messageIdCounter}` };
    }

    asButtonInteraction(): ButtonInteraction {
        return this as unknown as ButtonInteraction;
    }
}
