/**
 * Namespacing for AutoMod rules this repo manages (M9.1's "reconciliation
 * semantics" design call).
 *
 * Discord's AutoMod rule object has no free-form metadata field to stash an
 * owner marker in, only `name` — so the marker is encoded into the name
 * itself: `[gop-managed:<key>] <display name>`. Applying only ever
 * touches rules whose name matches this pattern; anything created by hand in
 * the Discord UI (or by a future, differently-branded tool) has a name that
 * never matches and is never read, written or deleted.
 */

export const MANAGED_RULE_MARKER = 'gop-managed';

const MANAGED_NAME_PATTERN = new RegExp(`^\\[${MANAGED_RULE_MARKER}:([a-z0-9-]+)\\] `);

/** Discord caps AutoMod rule names at 100 characters. */
export const DISCORD_RULE_NAME_MAX_LENGTH = 100;

export class ManagedRuleNameTooLongError extends Error {
    constructor(key: string, name: string) {
        super(
            `Managed rule name for "${key}" is ${name.length} characters, over Discord's ` +
                `${DISCORD_RULE_NAME_MAX_LENGTH}-character limit: "${name}". Shorten displayName.`,
        );
        this.name = 'ManagedRuleNameTooLongError';
    }
}

export function buildManagedRuleName(key: string, displayName: string): string {
    const name = `[${MANAGED_RULE_MARKER}:${key}] ${displayName}`;
    if (name.length > DISCORD_RULE_NAME_MAX_LENGTH) {
        throw new ManagedRuleNameTooLongError(key, name);
    }
    return name;
}

/**
 * Splits a remote rule's `name` back into the `key` this repo tracks it by
 * and the `displayName` an operator sees in the Discord UI. Returns `null`
 * for any name that does not carry the managed marker — the caller's signal
 * to leave the rule alone.
 */
export function parseManagedRuleName(
    remoteName: string,
): { key: string; displayName: string } | null {
    const match = remoteName.match(MANAGED_NAME_PATTERN);
    if (!match || match[1] === undefined) {
        return null;
    }
    return { key: match[1], displayName: remoteName.slice(match[0].length) };
}

export function parseManagedRuleKey(remoteName: string): string | null {
    return parseManagedRuleName(remoteName)?.key ?? null;
}
