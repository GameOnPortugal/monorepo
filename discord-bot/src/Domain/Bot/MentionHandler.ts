import type {MentionContext} from "./MentionContext";

export interface MentionHandler {
    handle: (context: MentionContext) => Promise<void>;

    supports: (context: MentionContext) => boolean;
}