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
export async function safeReply(interaction: any, payload: any): Promise<unknown> {
    if (interaction.replied) {
        return interaction.followUp(payload);
    }

    if (interaction.deferred) {
        return interaction.editReply(payload);
    }

    return interaction.reply(payload);
}
