import { describe, test, expect, beforeEach } from 'bun:test';
import { DiscordJobReporter } from '../../../../src/Infrastructure/Job/DiscordJobReporter.ts';
import type {
    CommunityMessage,
    GuildClient,
    ListMessagesOptions,
} from '../../../../src/Domain/Community/GuildClient.ts';
import { CommunityChannels } from '../../../../src/Domain/Community/CommunityChannels.ts';
import type { CustomEmoji } from '../../../../src/Domain/Community/CustomEmoji.ts';
import type { JobReportOutcome } from '../../../../src/Domain/Job/JobReporter.ts';
import InMemoryLogger from '../../../Helper/InMemoryLogger.ts';
import Logger from '../../../../src/Application/Logger/Logger.ts';

/**
 * M6.8 — a per-run summary to an admin channel through the existing
 * GuildClient port. These tests hand-roll a fake GuildClient (no mocking
 * library, no real Discord connection) and assert the noise policy: loud on
 * failure, quiet on success, silent when there's nothing to say or nowhere
 * configured to say it.
 */
class FakeGuildClient implements GuildClient {
    public sentMessages: { channel: CommunityChannels; message: string }[] = [];
    public shouldThrowOnSend = false;

    async getTotalReactionsByEmoji(
        _channel: CommunityChannels,
        _messageId: string,
        _emoji: CustomEmoji,
    ): Promise<number> {
        return 0;
    }

    async getMessageUrl(_channel: CommunityChannels, _messageId: string): Promise<string> {
        return 'https://discord.com/channels/x/y/z';
    }

    // M5.1/M5.2 added deleteMessage to the GuildClient port after this fake
    // was written. Recorded rather than ignored so a future reporter change
    // that started deleting messages would be visible in a test, not silent.
    public deletedMessages: { channelId: string; messageId: string }[] = [];

    async deleteMessage(channelId: string, messageId: string): Promise<void> {
        this.deletedMessages.push({ channelId, messageId });
    }

    async sendMessage(channel: CommunityChannels, message: string): Promise<string> {
        if (this.shouldThrowOnSend) {
            throw new Error('discord is down');
        }
        this.sentMessages.push({ channel, message });
        return 'message-id';
    }

    async getMessage(_channel: CommunityChannels, _messageId: string): Promise<CommunityMessage> {
        throw new Error('FakeGuildClient.getMessage is not used by DiscordJobReporter');
    }

    async listMessages(
        _channel: CommunityChannels,
        _options: ListMessagesOptions,
    ): Promise<CommunityMessage[]> {
        throw new Error('FakeGuildClient.listMessages is not used by DiscordJobReporter');
    }
}

function baseOutcome(overrides: Partial<JobReportOutcome> = {}): JobReportOutcome {
    return {
        jobName: 'demo-job',
        context: { dryRun: false, workLimit: 100 },
        durationMs: 42,
        ...overrides,
    };
}

describe('DiscordJobReporter', () => {
    let guildClient: FakeGuildClient;
    let logger: Logger;

    beforeEach(() => {
        guildClient = new FakeGuildClient();
        logger = new Logger([new InMemoryLogger()]);
    });

    test('does not post anything when no admin channel is configured', async () => {
        const reporter = new DiscordJobReporter(guildClient, logger, '');

        await reporter.report(
            baseOutcome({ result: { considered: 5, changed: 5, skipped: 0, failed: 0 } }),
        );
        await reporter.report(baseOutcome({ error: 'boom' }));

        expect(guildClient.sentMessages).toHaveLength(0);
    });

    test('posts loudly on a whole-run failure (thrown error)', async () => {
        const reporter = new DiscordJobReporter(guildClient, logger, 'admin-channel-id');

        await reporter.report(baseOutcome({ error: 'connection refused' }));

        expect(guildClient.sentMessages).toHaveLength(1);
        expect(guildClient.sentMessages[0]?.channel).toBe(CommunityChannels.ADMIN);
        expect(guildClient.sentMessages[0]?.message).toContain('demo-job');
        expect(guildClient.sentMessages[0]?.message).toContain('connection refused');
        expect(guildClient.sentMessages[0]?.message).toContain('🔴');
    });

    test('posts loudly when the job ran but reported failed items', async () => {
        const reporter = new DiscordJobReporter(guildClient, logger, 'admin-channel-id');

        await reporter.report(
            baseOutcome({ result: { considered: 10, changed: 2, skipped: 6, failed: 2 } }),
        );

        expect(guildClient.sentMessages).toHaveLength(1);
        expect(guildClient.sentMessages[0]?.message).toContain('🔴');
        expect(guildClient.sentMessages[0]?.message).toContain('failed 2');
    });

    test('posts quietly when something changed and nothing failed', async () => {
        const reporter = new DiscordJobReporter(guildClient, logger, 'admin-channel-id');

        await reporter.report(
            baseOutcome({ result: { considered: 10, changed: 3, skipped: 7, failed: 0 } }),
        );

        expect(guildClient.sentMessages).toHaveLength(1);
        expect(guildClient.sentMessages[0]?.message).toContain('✅');
        expect(guildClient.sentMessages[0]?.message).not.toContain('🔴');
    });

    test('stays silent for a no-op run — nothing considered, nothing changed, nothing failed', async () => {
        const reporter = new DiscordJobReporter(guildClient, logger, 'admin-channel-id');

        await reporter.report(
            baseOutcome({ result: { considered: 0, changed: 0, skipped: 0, failed: 0 } }),
        );

        expect(guildClient.sentMessages).toHaveLength(0);
    });

    test('never posts for a dry run, even if the (synthetic) result looks noteworthy', async () => {
        const reporter = new DiscordJobReporter(guildClient, logger, 'admin-channel-id');

        await reporter.report(
            baseOutcome({
                context: { dryRun: true, workLimit: 100 },
                result: { considered: 10, changed: 10, skipped: 0, failed: 5 },
            }),
        );

        expect(guildClient.sentMessages).toHaveLength(0);
    });

    test('a GuildClient failure while posting does not propagate', async () => {
        guildClient.shouldThrowOnSend = true;
        const reporter = new DiscordJobReporter(guildClient, logger, 'admin-channel-id');

        await expect(reporter.report(baseOutcome({ error: 'boom' }))).resolves.toBeUndefined();
    });
});
