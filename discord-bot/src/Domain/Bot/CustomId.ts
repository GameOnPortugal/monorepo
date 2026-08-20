/**
 * Custom IDs for message components and modals (M4.7).
 *
 * Discord gives a component exactly one piece of state that survives the round
 * trip: a `custom_id` string of at most 100 characters, echoed back verbatim
 * when the component is used. That string is how a click on a button posted
 * days ago finds the handler that should run, so its shape is a wire format,
 * not an implementation detail — hence one module that owns it rather than
 * `startsWith('mkt:')` scattered across handlers.
 *
 * The shape is `<namespace>:<action>[:<arg>...]`, e.g. `mkt:sold:<adId>`.
 * `BotExecutor` dispatches on the namespace alone; the handler that owns the
 * namespace interprets the rest.
 *
 * ## The custom ID is untrusted input
 *
 * A `custom_id` is client-supplied. Discord echoes back whatever the message
 * carries, and a message's components are visible to everyone who can read
 * the channel. So a custom ID says *what the user is asking for*, never *what
 * they are allowed to do*: `mkt:sold:<adId>` means "this member clicked the
 * sold button on ad X", and the handler must still load ad X and check that
 * the clicker owns it. Encoding an author id into the custom ID and comparing
 * it against `interaction.user.id` looks like authorisation and is not — it
 * only proves the two halves of the same string match.
 */

/** Discord's hard limit on `custom_id` (characters, not bytes). */
export const CUSTOM_ID_MAX_LENGTH = 100;

const SEPARATOR = ':';

export class InvalidCustomId extends Error {}

export interface ParsedCustomId {
    readonly namespace: string;
    readonly action: string;
    readonly args: string[];
}

/**
 * Builds a `<namespace>:<action>[:<arg>...]` custom ID.
 *
 * Throws rather than truncating when the result would exceed Discord's 100
 * character limit: a truncated custom ID is not a shorter custom ID, it is a
 * button that silently routes nowhere (or, worse, to the wrong record) once
 * it is clicked — days later, in production, with no error at the call site
 * that built it. Failing here surfaces it in the test that renders the
 * component instead.
 */
export function buildCustomId(namespace: string, action: string, ...args: string[]): string {
    for (const part of [namespace, action, ...args]) {
        if (part.length === 0) {
            throw new InvalidCustomId('Custom ID segments cannot be empty');
        }
        if (part.includes(SEPARATOR)) {
            throw new InvalidCustomId(
                `Custom ID segments cannot contain "${SEPARATOR}": ${JSON.stringify(part)}`,
            );
        }
    }

    const customId = [namespace, action, ...args].join(SEPARATOR);
    if (customId.length > CUSTOM_ID_MAX_LENGTH) {
        throw new InvalidCustomId(
            `Custom ID "${customId}" is ${customId.length} characters, over Discord's ${CUSTOM_ID_MAX_LENGTH} limit`,
        );
    }

    return customId;
}

/**
 * Parses a custom ID received from Discord. Returns `null` — rather than
 * throwing — for anything that is not in this format, because the input is
 * arbitrary: a component posted by an older version of the bot, or by a
 * different app entirely if the bot is ever added to a guild alongside one.
 * "Not ours" is an ordinary outcome for a dispatcher, not an error.
 */
export function parseCustomId(customId: string): ParsedCustomId | null {
    const segments = customId.split(SEPARATOR);
    const [namespace, action, ...args] = segments;

    if (!namespace || !action || args.some((arg) => arg.length === 0)) {
        return null;
    }

    return { namespace, action, args };
}
