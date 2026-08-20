import type {
    AnySelectMenuInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    Client,
    ModalSubmitInteraction,
} from 'discord.js';
import type { SlashCommandContext } from './SlashCommandContext';

/**
 * Every interaction shape the bot could ever receive from Discord, as a
 * discriminated union on `kind`. Only the `chat-input` member
 * (`SlashCommandContext`) is actually dispatched today — `BotExecutor` and
 * `DiscordBot`'s `InteractionCreate` handler only route
 * `ChatInputCommandInteraction`s. The other members are typed here so a
 * future dispatcher (autocomplete, buttons, modals — see M4.7/M4.8) has a
 * real type to grow into instead of another `interaction: any`. Building
 * that dispatcher is out of scope for this change.
 */
export interface AutocompleteInteractionContext {
    readonly kind: 'autocomplete';
    readonly client?: Client;
    readonly interaction: AutocompleteInteraction;
}

export interface ComponentInteractionContext {
    readonly kind: 'component';
    readonly client?: Client;
    readonly interaction: ButtonInteraction | AnySelectMenuInteraction;
}

export interface ModalInteractionContext {
    readonly kind: 'modal';
    readonly client?: Client;
    readonly interaction: ModalSubmitInteraction;
}

export type InteractionContext =
    | SlashCommandContext
    | AutocompleteInteractionContext
    | ComponentInteractionContext
    | ModalInteractionContext;
