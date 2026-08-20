/**
 * M4.4 — lifecycle hardening: SIGTERM/SIGINT (and a fatal uncaughtException)
 * need to destroy the Discord client and disconnect Prisma before the
 * process exits, so a redeploy doesn't leave a gateway session dangling.
 *
 * Split out of src/index.ts as a small factory, rather than inlined there,
 * specifically so the "a second signal must not double-destroy" idempotency
 * requirement is unit-testable: src/index.ts wires real dependencies
 * (the bot's destroy(), Prisma's $disconnect(), the injected Logger,
 * process.exit), but nothing here talks to a real process, a real Discord
 * client or a real database — it can be exercised directly with hand-rolled
 * fakes, no mocking library, no environment variables.
 */
export interface GracefulShutdownDeps {
    /** Destroys the live bot client, if any. Must be safe to call even when there is nothing to destroy. */
    destroy: () => Promise<void>;
    /** Disconnects the database client. */
    disconnect: () => Promise<void>;
    log: (message: string) => void;
    logError: (message: string, error: unknown) => void;
    exit: (code: number) => void;
}

export type ShutdownHandler = (reason: string, exitCode: number) => Promise<void>;

export function createShutdown(deps: GracefulShutdownDeps): ShutdownHandler {
    let shuttingDown = false;

    return async function shutdown(reason: string, exitCode: number): Promise<void> {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;

        deps.log(`Shutting down (${reason})`);

        try {
            await deps.destroy();
        } catch (error) {
            deps.logError('Error destroying bot client during shutdown', error);
        }

        try {
            await deps.disconnect();
        } catch (error) {
            deps.logError('Error disconnecting Prisma during shutdown', error);
        }

        deps.exit(exitCode);
    };
}
