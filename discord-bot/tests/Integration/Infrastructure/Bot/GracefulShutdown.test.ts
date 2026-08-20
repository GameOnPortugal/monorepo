import { describe, test, expect } from 'bun:test';
import {
    createShutdown,
    type GracefulShutdownDeps,
} from '../../../../src/Infrastructure/Bot/GracefulShutdown.ts';

/**
 * Regression coverage for M4.4 (C6): the container is killed today with
 * no SIGTERM handling at all, leaving gateway sessions dangling on every
 * redeploy. The fix must also be idempotent — a second SIGTERM arriving
 * while the first is still shutting down (or an uncaughtException firing
 * mid-shutdown) must not double-destroy the client or double-disconnect
 * Prisma. Hand-rolled fakes, no mocking library, no real process/Discord
 * client/database involved — src/index.ts wires the real dependencies.
 */
function createFakeDeps() {
    const calls: string[] = [];
    const exitCodes: number[] = [];

    const deps: GracefulShutdownDeps = {
        destroy: async () => {
            calls.push('destroy');
        },
        disconnect: async () => {
            calls.push('disconnect');
        },
        log: () => {},
        logError: () => {},
        exit: (code: number) => {
            exitCodes.push(code);
        },
    };

    return { calls, exitCodes, deps };
}

describe('createShutdown', () => {
    test('destroys the client and disconnects once, then exits with the given code', async () => {
        const { calls, exitCodes, deps } = createFakeDeps();
        const shutdown = createShutdown(deps);

        await shutdown('SIGTERM', 0);

        expect(calls).toEqual(['destroy', 'disconnect']);
        expect(exitCodes).toEqual([0]);
    });

    test('is idempotent: a second signal does not double-destroy or double-disconnect', async () => {
        const { calls, exitCodes, deps } = createFakeDeps();
        const shutdown = createShutdown(deps);

        await shutdown('SIGTERM', 0);
        await shutdown('SIGINT', 0);

        expect(calls).toEqual(['destroy', 'disconnect']);
        expect(exitCodes).toEqual([0]);
    });

    test('concurrent signals (no await between them) still only run the shutdown body once', async () => {
        const { calls, exitCodes, deps } = createFakeDeps();
        const shutdown = createShutdown(deps);

        await Promise.all([shutdown('SIGTERM', 0), shutdown('SIGINT', 0)]);

        expect(calls).toEqual(['destroy', 'disconnect']);
        expect(exitCodes).toEqual([0]);
    });

    test('an error destroying the client does not stop Prisma from disconnecting', async () => {
        const { calls, exitCodes, deps } = createFakeDeps();
        deps.destroy = async () => {
            calls.push('destroy');
            throw new Error('client.destroy() blew up');
        };
        const errors: string[] = [];
        deps.logError = (message) => {
            errors.push(message);
        };
        const shutdown = createShutdown(deps);

        await shutdown('uncaughtException', 1);

        expect(calls).toEqual(['destroy', 'disconnect']);
        expect(exitCodes).toEqual([1]);
        expect(errors).toEqual(['Error destroying bot client during shutdown']);
    });
});
