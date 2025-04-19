import type {SlashCommandContext} from "./SlashCommandContext";

export interface SlashCommandHandler {
    getName: () => string;

    builder: () => any;

    handle: (context: SlashCommandContext) => Promise<void>;
}
