/**
 * Env validation at boot (GLOBAL-PLAN M1.3).
 *
 * Hand-rolled rather than zod/typebox: three required string vars is not
 * enough surface to justify a new runtime dependency, and this stays well
 * under the ~80-line budget for that call. Revisit if the schema grows
 * enums/numbers/nested shapes.
 *
 * Two separate schemas, not one, because "required" is entry-point-specific:
 *  - `validateBaseEnv` covers what every entry point needs (DATABASE_URL is
 *    read by Prisma in all three: src/index.ts, bin/console.ts, and the test
 *    suite).
 *  - `validateBotEnv` covers what only the live bot process needs
 *    (DISCORD_TOKEN / DISCORD_CLIENT_ID). It is deliberately NOT called from
 *    inversify.config.ts, which is imported by bin/console.ts and by every
 *    test file via `myContainer` — calling it there would process.exit(1)
 *    the test suite and the console entry point, both of which run without
 *    a Discord token on purpose (that absence is what makes InMemoryClient
 *    bind instead of a real Discord.Client — see inversify.config.ts).
 *    Only src/index.ts — the actual bot process — calls validateBotEnv().
 */

function collect(
    env: NodeJS.ProcessEnv,
    keys: readonly string[],
): { values: Record<string, string>; errors: string[] } {
    const values: Record<string, string> = {};
    const errors: string[] = [];

    for (const key of keys) {
        const raw = env[key];
        if (raw === undefined || raw.trim().length === 0) {
            errors.push(`${key} is required but was not set`);
            continue;
        }
        values[key] = raw;
    }

    return { values, errors };
}

export interface BaseEnv {
    DATABASE_URL: string;
    LOKI_HOST?: string;
    LOKI_AUTH?: string;
}

export interface BotEnv {
    DISCORD_TOKEN: string;
    DISCORD_CLIENT_ID: string;
}

export interface EnvValidationResult<T> {
    config: T | undefined;
    errors: string[];
}

export function validateBaseEnv(
    env: NodeJS.ProcessEnv = process.env,
): EnvValidationResult<BaseEnv> {
    const { values, errors } = collect(env, ['DATABASE_URL']);
    if (errors.length > 0) {
        return { config: undefined, errors };
    }

    return {
        config: {
            DATABASE_URL: values.DATABASE_URL as string,
            LOKI_HOST: env.LOKI_HOST?.trim() || undefined,
            LOKI_AUTH: env.LOKI_AUTH?.trim() || undefined,
        },
        errors: [],
    };
}

export function validateBotEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult<BotEnv> {
    const { values, errors } = collect(env, ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID']);
    if (errors.length > 0) {
        return { config: undefined, errors };
    }

    return {
        config: {
            DISCORD_TOKEN: values.DISCORD_TOKEN as string,
            DISCORD_CLIENT_ID: values.DISCORD_CLIENT_ID as string,
        },
        errors: [],
    };
}

/** Logs every problem at once, then exits — never a silent fallback, never a stack trace. */
export function exitOnEnvErrors(errors: string[]): void {
    if (errors.length === 0) {
        return;
    }

    console.error('Invalid environment configuration:');
    for (const error of errors) {
        console.error(`  - ${error}`);
    }
    process.exit(1);
}

/** Validates and exits on failure in one call; narrows away the `| undefined` for callers that don't need the raw errors array. */
export function requireEnv<T>(result: EnvValidationResult<T>): T {
    exitOnEnvErrors(result.errors);
    // Unreachable when errors is non-empty: exitOnEnvErrors always exits(1) above.
    return result.config as T;
}
