import { myContainer } from './Infrastructure/DependencyInjection/inversify.config';
import type { Bot } from './Domain/Bot/Bot.ts';
import type Logger from './Application/Logger/Logger';
import { TYPES } from './Infrastructure/DependencyInjection/types.ts';
import type { PrismaClient } from '@prisma/client';
import { exitOnEnvErrors, validateBotEnv } from './Infrastructure/Config/env.ts';
import { createShutdown } from './Infrastructure/Bot/GracefulShutdown.ts';

// M1.3: this is the one entry point that actually starts a live Discord
// bot, so it is the one that enforces DISCORD_TOKEN / DISCORD_CLIENT_ID
// being set — loudly, with every problem reported at once, exiting non-zero
// rather than falling through to InMemoryClient. That fallback exists in
// inversify.config.ts specifically for the test suite and bin/console.ts,
// neither of which reach this file. See Infrastructure/Config/env.ts.
exitOnEnvErrors(validateBotEnv().errors);

const logger = myContainer.get<Logger>(TYPES.Logger);
const app = myContainer.get<Bot>(TYPES.Bot);

// The Domain/Bot/Bot.ts port only requires start() — deliberately not
// widened here to add destroy(), since only DiscordBot implements it
// (InMemoryClient never reaches this file, given the exit above, but is
// still handled defensively by createShutdown/GracefulShutdown.ts).
interface StoppableBot extends Bot {
    destroy?: () => Promise<void>;
}
const stoppableApp = app as StoppableBot;

// M4.4 — lifecycle hardening. Idempotency (a second SIGTERM/SIGINT, or an
// uncaughtException that arrives mid-shutdown, must not double-destroy the
// client or double-disconnect Prisma) lives in createShutdown itself — see
// GracefulShutdown.ts and its tests.
const shutdown = createShutdown({
    destroy: async () => {
        if (typeof stoppableApp.destroy === 'function') {
            await stoppableApp.destroy();
        }
    },
    disconnect: async () => {
        const prisma = myContainer.get<PrismaClient>(TYPES.OrmClient);
        await prisma.$disconnect();
    },
    log: (message) => logger.info(message),
    logError: (message, error) => logger.error(message, { error }),
    exit: (code) => process.exit(code),
});

process.on('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
});
process.on('SIGINT', () => {
    void shutdown('SIGINT', 0);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    void shutdown('uncaughtException', 1);
});

(async () => {
    try {
        await app.start();
        logger.info('⚡️ Discord Bot app is running!');
    } catch (error) {
        logger.error('Error starting app:', { error });
        // M1.4: registerSlashCommands() (and start() more generally) now
        // fails loudly instead of starting with a stale command set or a
        // half-initialised client — so a thrown start() is fatal here too.
        process.exit(1);
    }
})();
