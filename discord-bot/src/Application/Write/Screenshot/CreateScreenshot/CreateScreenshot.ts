import type Command from '../../../../Domain/Command/Command.ts';
import type { ScreenshotId } from '../../../../Domain/Screenshot/ScreenshotId.ts';

export class CreateScreenshot implements Command {
    constructor(
        public readonly id: ScreenshotId,
        public readonly name: string,
        public readonly authorId: string | null,
        public readonly channelId: string | null,
        public readonly messageId: string | null,
        public readonly platform: string,
        public readonly image: string,
        // Optional, M4.9: Discord reports the attachment's byte size on the
        // interaction (`attachment.size`), which lets the handler reject an
        // oversized upload before making any network call at all. Optional
        // and last so existing call sites (and the fixtures below) keep
        // working unchanged; when absent the handler still enforces the cap
        // while streaming, just without the pre-fetch short-circuit.
        public readonly imageSize?: number,
    ) {}
}
