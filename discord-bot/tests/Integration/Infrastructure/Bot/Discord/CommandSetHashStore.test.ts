import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CommandSetHashStore } from '../../../../../src/Infrastructure/Bot/Discord/CommandSetHashStore';

/**
 * M4.3 — real filesystem, no mocking library (matching this codebase's
 * house rule): each test gets its own throwaway temp directory so nothing
 * here touches the real `~/.gop-bot` a live boot would use.
 */
describe('CommandSetHashStore', () => {
    const tempDirs: string[] = [];

    async function makeStore(): Promise<CommandSetHashStore> {
        const dir = await mkdtemp(join(tmpdir(), 'gop-bot-hash-store-'));
        tempDirs.push(dir);
        return new CommandSetHashStore(dir);
    }

    afterEach(async () => {
        await Promise.all(
            tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
        );
    });

    test('read() returns undefined when nothing has been written yet (fresh container)', async () => {
        const store = await makeStore();

        expect(await store.read('global')).toBeUndefined();
    });

    test('write() then read() round-trips the same hash for the same scope', async () => {
        const store = await makeStore();

        await store.write('global', 'abc123');

        expect(await store.read('global')).toBe('abc123');
    });

    test('a later write() for the same scope overwrites the earlier one', async () => {
        const store = await makeStore();

        await store.write('global', 'first');
        await store.write('global', 'second');

        expect(await store.read('global')).toBe('second');
    });

    test('different scopes (e.g. global vs a dev guild) are stored independently', async () => {
        const store = await makeStore();

        await store.write('global', 'global-hash');
        await store.write('guild-123', 'guild-hash');

        expect(await store.read('global')).toBe('global-hash');
        expect(await store.read('guild-123')).toBe('guild-hash');
    });

    test('write() creates the directory when it does not exist yet', async () => {
        const base = await mkdtemp(join(tmpdir(), 'gop-bot-hash-store-'));
        tempDirs.push(base);
        const store = new CommandSetHashStore(join(base, 'nested', 'deeper'));

        await store.write('global', 'abc123');

        expect(await store.read('global')).toBe('abc123');
    });
});
