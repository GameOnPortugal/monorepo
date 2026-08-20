/**
 * Discord's hard limits on embed/message output (M4.10). Nothing in this
 * codebase enforced these before: `ListAdsSubcommand` added one embed field
 * per ad with no cap at all, so a user with 26+ listings broke the command
 * outright (Discord rejects the whole interaction response). This module is
 * the single place these numbers live so every call site caps consistently.
 *
 * Source: https://discord.com/developers/docs/resources/message#embed-object-embed-limits
 */
export const EMBED_MAX_FIELDS = 25;
export const EMBED_FIELD_NAME_MAX_LENGTH = 256;
export const EMBED_FIELD_VALUE_MAX_LENGTH = 1024;
export const EMBED_MAX_TOTAL_LENGTH = 6000;

/** Discord's plain message content limit. */
export const MESSAGE_MAX_LENGTH = 2000;

const ELLIPSIS = '…';

/**
 * Truncates a string to `maxLength`, replacing the tail with an ellipsis
 * rather than letting an over-long value throw at Discord's API boundary.
 */
export function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    if (maxLength <= ELLIPSIS.length) {
        return ELLIPSIS.slice(0, maxLength);
    }

    return `${value.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
}

/** Truncates a field name to Discord's 256-character embed field name limit. */
export function truncateFieldName(name: string): string {
    return truncate(name, EMBED_FIELD_NAME_MAX_LENGTH);
}

/** Truncates a field value to Discord's 1024-character embed field value limit. */
export function truncateFieldValue(value: string): string {
    return truncate(value, EMBED_FIELD_VALUE_MAX_LENGTH);
}

export interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface CappedFields<T> {
    /** At most `maxFields` fields, each truncated to Discord's per-field limits. */
    fields: EmbedField[];
    /** How many of the input items did not make it into `fields`. */
    omittedCount: number;
    /** The items that were left out. */
    omittedItems: T[];
}

/**
 * Builds up to `maxFields` embed fields (Discord's own hard cap,
 * `EMBED_MAX_FIELDS`, by default) from a list of items, truncating any
 * over-long name/value and reporting how many items had to be left out so
 * the caller can tell the user. Pass a smaller `maxFields` for a
 * command-specific display limit (e.g. `/screenshot list` shows at most 10)
 * while still sharing the same truncation/omission behaviour as every other
 * caller.
 *
 * Also respects the embed-wide 6000-character budget: 25 fields at the
 * per-field max (1024 chars) would total 25600 characters, well past the
 * limit, so a field that would push the running total over
 * `EMBED_MAX_TOTAL_LENGTH` is omitted too, not just ones past `maxFields`.
 * `reservedLength` lets the caller account for characters already spent on
 * the title/description/footer.
 */
export function capFields<T>(
    items: T[],
    toField: (item: T, index: number) => EmbedField,
    reservedLength = 0,
    maxFields: number = EMBED_MAX_FIELDS,
): CappedFields<T> {
    const fields: EmbedField[] = [];
    const omittedItems: T[] = [];
    let totalLength = reservedLength;

    items.forEach((item, index) => {
        if (fields.length >= maxFields) {
            omittedItems.push(item);
            return;
        }

        const field = toField(item, index);
        const name = truncateFieldName(field.name);
        const value = truncateFieldValue(field.value);
        const fieldLength = name.length + value.length;

        if (totalLength + fieldLength > EMBED_MAX_TOTAL_LENGTH) {
            omittedItems.push(item);
            return;
        }

        fields.push({ ...field, name, value });
        totalLength += fieldLength;
    });

    return { fields, omittedCount: omittedItems.length, omittedItems };
}

/**
 * Splits plain text into chunks no longer than `maxLength` (Discord's
 * 2000-character message content limit by default), breaking on line
 * boundaries where possible so a chunk doesn't cut a line in half.
 */
export function chunkMessage(text: string, maxLength: number = MESSAGE_MAX_LENGTH): string[] {
    if (text.length === 0) {
        return [];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt <= 0) {
            splitAt = maxLength;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt).replace(/^\n/, '');
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}
