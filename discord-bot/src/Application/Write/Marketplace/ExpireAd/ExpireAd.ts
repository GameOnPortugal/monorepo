import { AdId } from '../../../../Domain/Marketplace/AdId';
import type Command from '../../../../Domain/Command/Command.ts';

/**
 * M6.5/M6.6 — moves an ad to `status='expired'` and removes its channel
 * message, but never touches the row otherwise (cross-cutting rule 2:
 * soft-delete, never hard-delete). Three different jobs/handlers reach this
 * same outcome, which is why `reason` exists — purely for logging, so a run
 * can be understood from its log line without re-deriving which bucket an
 * ad came from.
 */
export class ExpireAd implements Command {
    constructor(
        public readonly id: AdId,
        public readonly reason: 'orphaned-no-message' | 'no-response' | 'message-vanished',
    ) {}
}
