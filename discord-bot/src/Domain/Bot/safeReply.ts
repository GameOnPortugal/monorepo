import {
    MessageFlags,
    type InteractionEditReplyOptions,
    type InteractionReplyOptions,
    type RepliableInteraction,
} from 'discord.js';

/**
 * The payload shapes every safeReply() call site in this codebase actually
 * passes: a plain string, or the reply-time options object (which is what
 * `reply()`/`followUp()` are typed to accept).
 */
export type SafeReplyPayload = string | InteractionReplyOptions;

/**
 * Sends a reply to a Discord interaction, choosing the correct discord.js
 * method for the interaction's current state.
 *
 * Calling `interaction.reply()` a second time (e.g. from a catch block after
 * the try block already replied) throws `InteractionAlreadyReplied`, which
 * then hides whatever error actually happened. This helper mirrors the
 * `replied || deferred` guard that `DiscordBot.ts` already uses for its
 * top-level handler, so every call site gets the same safe behaviour:
 *
 * - already replied            -> `followUp` (send a new message)
 * - deferred but not replied   -> `editReply` (fill in the deferred reply)
 * - neither                    -> `reply`
 */
export async function safeReply(
    interaction: RepliableInteraction,
    payload: SafeReplyPayload,
): Promise<unknown> {
    if (interaction.replied) {
        return interaction.followUp(payload);
    }

    if (interaction.deferred) {
        // `editReply()` is typed narrower than `reply()`/`followUp()`: it
        // cannot accept `flags: Ephemeral` because a deferred reply's
        // ephemeral-ness is fixed by the original `deferReply()` call and
        // cannot change afterwards (a Discord API constraint, not a
        // discord.js oversight — see InteractionEditReplyOptions). Every
        // safeReply() caller that reaches this branch is passing the same
        // "something went wrong" payload it would otherwise hand to
        // `reply()`; any `flags` on it is a harmless no-op here.
        return interaction.editReply(payload as InteractionEditReplyOptions);
    }

    return interaction.reply(payload);
}

/**
 * Replies to an interaction ephemerally, regardless of how it has already
 * been acknowledged -- including the case where it was deferred *publicly*
 * (a command whose happy path is meant to be visible, e.g. `/trophy check`
 * shows off a profile) but this particular outcome -- an error, a
 * "not found" -- is not for the whole channel.
 *
 * This exists because of M0.3: "ephemeral" error messages were being posted
 * publicly, one of the five live production defects fixed and verified
 * before this file existed. The trap it guards against is calling
 * `editReply()` after a public defer: that edits the public "thinking..."
 * placeholder into a message everyone in the channel can see, because
 * ephemeral-ness is fixed at `deferReply()` time and cannot change
 * afterwards. The fix is to delete that placeholder and post a fresh,
 * genuinely ephemeral message via `followUp()` instead -- the supported
 * discord.js v14 pattern for "public defer, private outcome".
 *
 * Any subcommand that defers non-ephemerally but has a failure/not-found
 * path only the invoker should see needs this, not `safeReply()` -- reach
 * for this one first before re-deriving the same delete-then-followUp
 * dance from scratch.
 */
export async function replyPrivately(
    interaction: RepliableInteraction,
    payload: SafeReplyPayload,
): Promise<unknown> {
    const ephemeralPayload: InteractionReplyOptions = {
        ...(typeof payload === 'string' ? { content: payload } : payload),
        flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred && !interaction.replied) {
        await interaction.deleteReply();
        return interaction.followUp(ephemeralPayload);
    }

    if (interaction.replied) {
        return interaction.followUp(ephemeralPayload);
    }

    return interaction.reply(ephemeralPayload);
}
