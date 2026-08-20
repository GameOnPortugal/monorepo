import type { ComponentInteractionContext, ModalInteractionContext } from './InteractionContext';

/**
 * Handles button clicks, select-menu choices and modal submissions whose
 * custom ID lives in this handler's namespace (M4.7).
 *
 * One handler owns one namespace (`mkt`, `trophies`, …) and dispatches
 * internally on the parsed action — rather than one handler per button —
 * because a feature's buttons share the repositories and the ownership check
 * they need, and Discord's 100-character custom ID budget is better spent on
 * ids than on a long unique route name per control.
 *
 * Implementations MUST re-derive authorisation from their own data. See
 * `CustomId.ts` for why the custom ID itself can never carry it.
 */
export interface ComponentHandler {
    /**
     * The custom ID namespace this handler owns — the first `:`-separated
     * segment, e.g. `mkt`. Must be unique across handlers; `BotExecutor`
     * logs and refuses to guess when two handlers claim the same one.
     */
    getNamespace: () => string;

    handle: (context: ComponentInteractionContext | ModalInteractionContext) => Promise<void>;
}
