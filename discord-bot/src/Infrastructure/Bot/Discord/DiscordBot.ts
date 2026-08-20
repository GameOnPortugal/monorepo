import { inject, injectable } from 'inversify';
import {
    Client,
    Events,
    GatewayIntentBits,
    MessageFlags,
    Options,
    REST,
    RESTEvents,
    Routes,
} from 'discord.js';
import type { InvalidRequestWarningData, RateLimitData } from 'discord.js';
import { TYPES } from '../../DependencyInjection/types.ts';
import type Logger from '../../../Application/Logger/Logger.ts';
import type { Bot } from '../../../Domain/Bot/Bot.ts';
import { BotExecutor } from '../BotExecutor.ts';
import type { SlashCommandContext } from '../../../Domain/Bot/SlashCommandContext.ts';
import { safeReply } from '../../../Domain/Bot/safeReply.ts';

@injectable()
export class DiscordBot implements Bot {
    private readonly client: Client;
    private readonly rest: REST;
    private destroyed = false;

    constructor(
        private readonly token: string,
        private readonly clientId: string,
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(BotExecutor) private readonly botExecutor: BotExecutor,
    ) {
        // `allowedMentions: { parse: [] }` is set once here, on the Client
        // itself, so every message sent through this client — regardless of
        // which handler built it — has all mention parsing disabled by
        // default. This is what stops a member from pinging @everyone by
        // naming a marketplace item or screenshot "@everyone" (M0.2 / A1):
        // without it, discord.js parses mentions out of raw message content
        // even when nobody intended to @-mention anyone.
        //
        // M4.6 — cache limits + sweepers: this is a long-lived,
        // single-guild bot with only the `Guilds` intent (no
        // `GuildMembers`/`MessageContent` — keep it that way, see
        // GLOBAL-PLAN M4.6), so the caches that grow unbounded over time are
        // messages (one per interaction reply/announcement touched) and
        // users (one per interaction author). Both are capped and swept.
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds],
            allowedMentions: { parse: [] },
            makeCache: Options.cacheWithLimits({
                ...Options.DefaultMakeCacheSettings,
                MessageManager: 200,
                UserManager: 200,
            }),
            sweepers: {
                ...Options.DefaultSweeperSettings,
                messages: {
                    interval: 3_600, // every hour
                    lifetime: 1_800, // drop messages older than 30 minutes
                },
                users: {
                    interval: 3_600, // every hour
                    filter: () => (user) => user.id !== this.client.user?.id,
                },
            },
        });

        // Same REST client backs both slash-command registration and (once
        // logged in) everything discord.js does over HTTP. Rate-limit and
        // invalid-request events are wired into the injected Logger here —
        // an invalid-request spike is how you find out you're heading for a
        // Cloudflare ban before it happens (M4.6).
        this.rest = new REST().setToken(this.token);
        this.rest.on(RESTEvents.RateLimited, (info: RateLimitData) => {
            this.logger.warn('Discord REST rate limit hit', {
                route: info.route,
                method: info.method,
                timeToReset: info.timeToReset,
                global: info.global,
            });
        });
        this.rest.on(RESTEvents.InvalidRequestWarning, (info: InvalidRequestWarningData) => {
            this.logger.warn('Discord REST invalid request warning', {
                count: info.count,
                remainingTime: info.remainingTime,
            });
        });
    }

    async start(): Promise<void> {
        // M1.4: registerSlashCommands() now throws on failure instead of
        // swallowing to console.error — so a failed sync stops the bot here,
        // before client.login(), rather than starting it with a stale
        // command set. src/index.ts treats a thrown start() as fatal
        // (process.exit(1)).
        await this.registerSlashCommands();

        // M4.4 — lifecycle hardening: neither of these existed before, so a
        // client-level error (e.g. a WebSocket failure) or a shard error was
        // invisible — nothing logged it, and nothing distinguished it from
        // a clean shutdown.
        this.client.on(Events.Error, (error) => {
            this.logger.error('Discord client error', { error });
        });
        this.client.on(Events.ShardError, (error, shardId) => {
            this.logger.error('Discord shard error', { error, shardId });
        });

        this.client.once(Events.ClientReady, (readyClient) => {
            this.logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const slashCommandContext: SlashCommandContext = {
                channel_id: interaction.channelId,
                command: interaction.commandName,
                text: '',
                client: this.client,
                interaction: interaction,
            };

            try {
                await this.botExecutor.execute(slashCommandContext);
            } catch (error: any) {
                this.logger.error('error happened', { error });
                await safeReply(interaction, {
                    content: 'There was an error while executing this command!',
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        await this.client.login(this.token);
    }

    /**
     * M4.4 — graceful shutdown: destroys the gateway connection so a
     * redeploy doesn't leave a dangling session. Idempotent — SIGTERM
     * followed by SIGINT (or an uncaughtException arriving mid-shutdown)
     * must not double-destroy the client, which discord.js does not itself
     * guard against.
     */
    async destroy(): Promise<void> {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;

        this.logger.info('Destroying Discord client');
        await this.client.destroy();
    }

    private async registerSlashCommands(): Promise<void> {
        const commands = [];
        for (const handler of this.botExecutor.slashCommandHandlers) {
            commands.push(handler.builder().toJSON());
        }

        this.logger.log(`Started refreshing ${commands.length} application (/) commands.`);

        try {
            // The put method is used to fully refresh all commands in the guild with the current set
            const data = (await this.rest.put(Routes.applicationCommands(this.clientId), {
                body: commands,
            })) as unknown[];

            this.logger.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            // M1.4: through the injected Logger (not console.error, which
            // bypassed it entirely), and rethrown — start() no longer
            // catches this, so the bot never logs in with a command set
            // that failed to register.
            this.logger.error('Failed to register application (/) commands', { error });
            throw error;
        }
    }
}
