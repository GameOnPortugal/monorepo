import { describe, expect, it } from 'bun:test';
import {
    messages,
    messagesFor,
    type BotMessages,
} from '../../../../../src/Domain/Bot/I18n/messages';

/**
 * The catalogue's own guard rails. TypeScript already refuses to compile an
 * `en` bundle that is missing a key (it is annotated with `BotMessages`,
 * derived from `pt`), so these tests cover what the type system cannot:
 * that no key was "translated" by copying the Portuguese string across, and
 * that the two bundles agree in *shape* at runtime, including the nested
 * label tables that are typed as `Record<string, string>` and therefore
 * exempt from the compile-time parity check.
 */

type Path = string;

function walk(value: unknown, prefix: Path, out: Map<Path, unknown>): void {
    if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            walk(child, prefix ? `${prefix}.${key}` : key, out);
        }
        return;
    }
    out.set(prefix, value);
}

function flatten(bundle: BotMessages): Map<Path, unknown> {
    const out = new Map<Path, unknown>();
    walk(bundle, '', out);
    return out;
}

/** Renders a leaf so pt and en can be compared: functions get filled with placeholders. */
function render(leaf: unknown): string {
    if (typeof leaf === 'function') {
        const args = Array.from({ length: leaf.length }, (_, i) => (i === 0 ? 'X' : i));
        return String(leaf(...args));
    }
    return String(leaf);
}

describe('the message catalogues', () => {
    const pt = messages('pt');
    const en = messages('en');

    it('has exactly the same set of keys in both languages, nested tables included', () => {
        expect([...flatten(en).keys()].sort()).toEqual([...flatten(pt).keys()].sort());
    });

    it('never leaves a Portuguese string sitting in the English bundle', () => {
        const ptLeaves = flatten(pt);
        const identical: Path[] = [];

        for (const [path, enLeaf] of flatten(en)) {
            // `intlLocale` and the pure-punctuation keys legitimately differ
            // or legitimately match; everything else that matches character
            // for character is an untranslated key.
            const enText = render(enLeaf);
            if (enText === render(ptLeaves.get(path)) && /\p{L}{4}/u.test(enText)) {
                identical.push(path);
            }
        }

        expect(identical).toEqual([]);
    });

    it('uses a different number/date locale per language', () => {
        expect(pt.intlLocale).toBe('pt-PT');
        expect(en.intlLocale).toBe('en-GB');
    });

    it('picks the catalogue off an interaction, defaulting to Portuguese', () => {
        expect(messagesFor({ locale: 'en-GB' }).marketplace.adNotFound).toBe(
            en.marketplace.adNotFound,
        );
        expect(messagesFor({ locale: 'pt-BR' }).marketplace.adNotFound).toBe(
            pt.marketplace.adNotFound,
        );
        expect(messagesFor({}).marketplace.adNotFound).toBe(pt.marketplace.adNotFound);
    });
});
