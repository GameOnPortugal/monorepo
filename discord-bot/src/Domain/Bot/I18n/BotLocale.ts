import { Locale } from 'discord.js';

/**
 * The two languages the bot speaks. Not Discord's `Locale` enum: that has 30
 * entries the community has no copy for, and no `pt-PT` entry at all. This is
 * the *resolved* answer to "which of our two message catalogues does this
 * member get", which is the only locale question any call site ever asks.
 */
export type BotLocale = 'pt' | 'en';

/**
 * The locale tag used for `setNameLocalizations()` / `setDescriptionLocalizations()`
 * on every command builder.
 *
 * Discord's supported locale list (`discord-api-types`' `Locale` enum) has
 * **no `pt-PT`** — only `Locale.PortugueseBR` (`pt-BR`) exists — so this is
 * the closest official key available, not a claim that the copy underneath
 * it is Brazilian Portuguese. The strings are written for the pt-PT
 * community this bot serves; only the locale *tag* Discord matches a
 * Portuguese client against is borrowed. Originally defined in
 * `MarketplaceSlashCommand.ts` (M5.4); hoisted here when the rest of the
 * bot became bilingual so there is exactly one definition.
 */
export const PT_LOCALE = Locale.PortugueseBR;

/**
 * Anything carrying Discord's user-locale field. Every interaction type
 * (`ChatInputCommandInteraction`, `ButtonInteraction`, `ModalSubmitInteraction`,
 * `AutocompleteInteraction`, …) has one, but they share no common
 * discord.js base type narrow enough to name here — and typing it
 * structurally keeps this module callable from the test fixtures, which are
 * plain objects (`tests/Helper/FakeInteraction.ts`).
 */
export interface LocaleCarrier {
    readonly locale?: string | null;
}

/**
 * Which catalogue a raw Discord locale tag maps to.
 *
 * The rule, and why:
 *
 *  - `pt-*` -> Portuguese. `pt-BR` is the only Portuguese tag Discord has,
 *    but the prefix match means a future `pt-PT` would need no change here.
 *  - anything else -> English. A member running Discord in French or German
 *    is far more likely to read English than pt-PT.
 *  - missing/empty -> **Portuguese**, not English. This is a Portuguese
 *    community (cross-cutting rule 1 in `docs/plans/GLOBAL-PLAN.md`); when
 *    Discord tells us nothing, the community language is the safer default
 *    than silently switching everyone to English.
 *
 * Note the limit of what Discord actually offers: `interaction.locale` is
 * the language the member set **in their Discord client**, not their
 * nationality. A Portuguese member whose client is in English gets English —
 * which is the intended trade, since that member demonstrably reads English,
 * but it does mean this is a *language* preference and never a country
 * check. There is no country field on an interaction to check instead.
 */
export function resolveBotLocale(raw?: string | null): BotLocale {
    if (!raw) {
        return 'pt';
    }

    return raw.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

/** `resolveBotLocale` applied straight to an interaction. */
export function localeOf(carrier: LocaleCarrier | null | undefined): BotLocale {
    return resolveBotLocale(carrier?.locale);
}
