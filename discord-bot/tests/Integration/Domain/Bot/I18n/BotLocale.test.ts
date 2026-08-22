import { describe, expect, it } from 'bun:test';
import { Locale } from 'discord.js';
import {
    localeOf,
    resolveBotLocale,
    PT_LOCALE,
} from '../../../../../src/Domain/Bot/I18n/BotLocale';

describe('resolveBotLocale', () => {
    it('maps every Portuguese tag to the pt catalogue', () => {
        // pt-BR is the only Portuguese entry Discord actually has today; the
        // prefix match is what would make a future pt-PT work with no change.
        expect(resolveBotLocale('pt-BR')).toBe('pt');
        expect(resolveBotLocale('pt-PT')).toBe('pt');
        expect(resolveBotLocale('pt')).toBe('pt');
        expect(resolveBotLocale('PT-br')).toBe('pt');
    });

    it('maps every other language to the en catalogue', () => {
        expect(resolveBotLocale(Locale.EnglishGB)).toBe('en');
        expect(resolveBotLocale(Locale.EnglishUS)).toBe('en');
        expect(resolveBotLocale(Locale.French)).toBe('en');
        expect(resolveBotLocale(Locale.SpanishES)).toBe('en');
        expect(resolveBotLocale(Locale.Japanese)).toBe('en');
    });

    it('falls back to Portuguese, not English, when Discord tells us nothing', () => {
        // Deliberate: this is a Portuguese community, so an unknown locale
        // must not silently switch a member to English (cross-cutting rule 1).
        expect(resolveBotLocale(undefined)).toBe('pt');
        expect(resolveBotLocale(null)).toBe('pt');
        expect(resolveBotLocale('')).toBe('pt');
    });

    it('reads the locale straight off an interaction, tolerating a missing one', () => {
        expect(localeOf({ locale: Locale.EnglishGB })).toBe('en');
        expect(localeOf({ locale: 'pt-BR' })).toBe('pt');
        expect(localeOf({})).toBe('pt');
        expect(localeOf(null)).toBe('pt');
        expect(localeOf(undefined)).toBe('pt');
    });

    it('uses pt-BR as the localisation tag, the closest thing Discord has to pt-PT', () => {
        expect(PT_LOCALE).toBe(Locale.PortugueseBR);
    });
});
