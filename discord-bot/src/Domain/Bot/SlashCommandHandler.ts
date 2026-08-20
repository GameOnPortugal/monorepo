import type { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import type { SlashCommandContext } from './SlashCommandContext';

export interface SlashCommandHandler {
    getName: () => string;

    // discord.js's own builder narrows from `SlashCommandBuilder` to
    // `SlashCommandSubcommandsOnlyBuilder` the moment `.addSubcommand()` is
    // called, so every `builder()` implementation with subcommands
    // (Marketplace/Screenshot/Trophy) actually returns the narrower type.
    // Both are accepted here since `PingSlashCommand` (no subcommands) still
    // returns the base `SlashCommandBuilder`.
    builder: () => SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;

    handle: (context: SlashCommandContext) => Promise<void>;
}
