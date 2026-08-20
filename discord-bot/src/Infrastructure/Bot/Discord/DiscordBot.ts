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
import {
    hashCommandSet,
    resolveCommandRegistrationTarget,
} from '../../../Domain/Bot/CommandRegistration.ts';
import { CommandSetHashStore } from './CommandSetHashStore.ts';

@injectable()
export class DiscordBot implements Bot {
    private readonly client: Client;
    private readonly rest: REST;
    private readonly hashStore: CommandSetHashStore;
    private destroyed = false;

    constructor(
        private readonly token: string,
        private readonly clientId: string,
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(BotExecutor) private readonly botExecutor: BotExecutor,
        // M4.3 — dev-only guild for fast, guild-scoped command registration.
        // Deliberately NOT DISCORD_GUILD_ID (see CommandRegistration.ts for
        // why): that variable already means "the production guild" and
        // defaults to it on its own, so reusing it here would risk
        // registering guild-scoped commands into production. Unset (the
        // default everywhere except an explicit local dev `.env`) means
        // global registration — today's behaviour.
        private readonly devGuildId?: string,
    ) {
        this.hashStore = new CommandSetHashStore();
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
                kind: 'chat-input',
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

        // M4.3 — guild-scoped registration is instant (seconds), global can
        // take up to an hour to propagate. Which one is live is logged
        // explicitly and loudly on every boot — this is the "nobody is ever
        // confused about which set is live" requirement, since a guild-scoped
        // registration silently shadowing global commands in the wrong guild
        // is exactly the failure mode a quiet log line would hide.
        const target = resolveCommandRegistrationTarget(this.clientId, this.devGuildId);
        const route =
            target.scope === 'guild'
                ? Routes.applicationGuildCommands(target.clientId, target.guildId)
                : Routes.applicationCommands(target.clientId);
        const scopeKey = target.scope === 'guild' ? `guild-${target.guildId}` : 'global';

        if (target.scope === 'guild') {
            this.logger.log(
                `[DEV] Registering ${commands.length} application (/) commands to GUILD ${target.guildId} ` +
                    `(DISCORD_DEV_GUILD_ID is set) — guild commands appear instantly, but ONLY in that guild. ` +
                    `Unset DISCORD_DEV_GUILD_ID to register globally, as production does.`,
            );
        } else {
            this.logger.log(
                `Registering ${commands.length} application (/) commands GLOBALLY ` +
                    `(DISCORD_DEV_GUILD_ID is not set) — propagation can take up to an hour.`,
            );
        }

        // M4.3 — skip the PUT when the command set is byte-for-byte what was
        // last successfully registered for this exact scope, instead of
        // rewriting all commands on every boot. See CommandSetHashStore.ts
        // for where this is kept and why a redeploy still re-registers once.
        const hash = hashCommandSet(commands);
        const previousHash = await this.hashStore.read(scopeKey);
        if (previousHash === hash) {
            this.logger.log(
                `Command set unchanged since last successful registration (${scopeKey}) — skipping PUT.`,
            );
            return;
        }

        try {
            // The put method is used to fully refresh all commands for the target (guild or global) with the current set
            const data = (await this.rest.put(route, {
                body: commands,
            })) as unknown[];

            this.logger.log(`Successfully reloaded ${data.length} application (/) commands.`);

            try {
                await this.hashStore.write(scopeKey, hash);
            } catch (hashError) {
                // Registration itself succeeded — losing the cache write
                // only costs one redundant (but harmless) PUT on the next
                // boot, so this is a warning, not a reason to fail start().
                this.logger.warn('Failed to persist the registered command-set hash', {
                    error: hashError,
                });
            }
        } catch (error) {
            // M1.4: through the injected Logger (not console.error, which
            // bypassed it entirely), and rethrown — start() no longer
            // catches this, so the bot never logs in with a command set
            // that failed to register. Note the hash is only persisted on
            // success (above), so a failed PUT here is retried — never
            // silently skipped — on the next boot.
            this.logger.error('Failed to register application (/) commands', { error });
            throw error;
        }
    }
}
