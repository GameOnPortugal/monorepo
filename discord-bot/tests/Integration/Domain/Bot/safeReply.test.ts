import { describe, test, expect } from 'bun:test';
import type { RepliableInteraction } from 'discord.js';
import { safeReply } from '../../../../src/Domain/Bot/safeReply';

/**
 * safeReply() is the fix for M0.4 / B3 ("double-reply crashes"): a catch
 * block that blindly calls `interaction.reply()` after the try block (or a
 * nested subcommand handler) already replied throws
 * `InteractionAlreadyReplied`, which then hides whatever error actually
 * happened. These tests hand-roll a fake interaction — no mocking library is
 * used in this repo — that records which discord.js method gets called.
 */
function createFakeInteraction(state: { replied: boolean; deferred: boolean }) {
    const calls: { method: string; payload: unknown }[] = [];

    return {
        get replied() {
            return state.replied;
        },
        get deferred() {
            return state.deferred;
        },
        calls,
        reply: async (payload: unknown) => {
            calls.push({ method: 'reply', payload });
            state.replied = true;
        },
        followUp: async (payload: unknown) => {
            calls.push({ method: 'followUp', payload });
        },
        editReply: async (payload: unknown) => {
            calls.push({ method: 'editReply', payload });
        },
    };
}

/**
 * discord.js's interaction classes carry private fields (e.g.
 * `BaseInteraction#_cacheType`), so no plain object can structurally satisfy
 * `RepliableInteraction` — this cast is genuinely unavoidable to hand the
 * hand-rolled fake above to code typed against the real interaction.
 */
function asRepliable(interaction: ReturnType<typeof createFakeInteraction>): RepliableInteraction {
    return interaction as unknown as RepliableInteraction;
}

describe('safeReply', () => {
    test('calls reply() when the interaction has neither replied nor deferred', async () => {
        const interaction = createFakeInteraction({ replied: false, deferred: false });

        await safeReply(asRepliable(interaction), { content: 'hello' });

        expect(interaction.calls).toEqual([{ method: 'reply', payload: { content: 'hello' } }]);
    });

    test('calls followUp() instead of reply() when the interaction already replied', async () => {
        const interaction = createFakeInteraction({ replied: true, deferred: false });

        // This is the exact scenario that used to throw InteractionAlreadyReplied:
        // the try block (or a nested subcommand) already sent a reply, and a
        // catch block needs to report a second, separate error.
        await expect(
            safeReply(asRepliable(interaction), { content: 'boom' }),
        ).resolves.toBeUndefined();

        expect(interaction.calls).toEqual([{ method: 'followUp', payload: { content: 'boom' } }]);
    });

    test('calls editReply() when the interaction is deferred but not yet replied', async () => {
        const interaction = createFakeInteraction({ replied: false, deferred: true });

        await safeReply(asRepliable(interaction), { content: 'still working on it' });

        expect(interaction.calls).toEqual([
            { method: 'editReply', payload: { content: 'still working on it' } },
        ]);
    });

    test('does not throw when the interaction was already replied to', async () => {
        const interaction = createFakeInteraction({ replied: true, deferred: true });

        let thrown: unknown = null;
        try {
            await safeReply(asRepliable(interaction), { content: 'second error' });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeNull();
    });
});
