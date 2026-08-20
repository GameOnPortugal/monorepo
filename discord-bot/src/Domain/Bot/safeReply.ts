import type {
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    RepliableInteraction,
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
