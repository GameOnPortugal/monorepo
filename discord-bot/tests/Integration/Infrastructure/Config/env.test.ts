import { describe, test, expect } from 'bun:test';
import { validateBaseEnv, validateBotEnv } from '../../../../src/Infrastructure/Config/env.ts';

/**
 * Regression coverage for M1.3 (A6): an unset DISCORD_TOKEN used to
 * silently bind InMemoryClient with no indication anything was wrong.
 * `validateBaseEnv`/`validateBotEnv` take `env` as a parameter, exactly like
 * `resolveDiscordIds` (DiscordChannels.ts), specifically so this can be
 * asserted without a mocking library or touching the real process.env —
 * and, critically, without calling `process.exit()`, which would kill the
 * test runner. `exitOnEnvErrors`/`requireEnv` (the process.exit(1) side) are
 * intentionally not exercised here.
 */
describe('validateBaseEnv', () => {
    test('rejects a missing DATABASE_URL', () => {
        const { config, errors } = validateBaseEnv({});

        expect(config).toBeUndefined();
        expect(errors).toEqual(['DATABASE_URL is required but was not set']);
    });

    test('rejects a blank DATABASE_URL the same as a missing one', () => {
        const { config, errors } = validateBaseEnv({ DATABASE_URL: '   ' });

        expect(config).toBeUndefined();
        expect(errors).toEqual(['DATABASE_URL is required but was not set']);
    });

    test('accepts a set DATABASE_URL and leaves Loki config optional', () => {
        const { config, errors } = validateBaseEnv({
            DATABASE_URL: 'mysql://root:pw@localhost:3306/db',
        });

        expect(errors).toEqual([]);
        expect(config).toEqual({
            DATABASE_URL: 'mysql://root:pw@localhost:3306/db',
            LOKI_HOST: undefined,
            LOKI_AUTH: undefined,
        });
    });

    test('carries LOKI_HOST/LOKI_AUTH through when set', () => {
        const { config } = validateBaseEnv({
            DATABASE_URL: 'mysql://root:pw@localhost:3306/db',
            LOKI_HOST: 'https://loki.example.com',
            LOKI_AUTH: 'user:pass',
        });

        expect(config?.LOKI_HOST).toBe('https://loki.example.com');
        expect(config?.LOKI_AUTH).toBe('user:pass');
    });
});

describe('validateBotEnv', () => {
    test('reports every missing required var at once, not just the first', () => {
        const { config, errors } = validateBotEnv({});

        expect(config).toBeUndefined();
        expect(errors).toEqual([
            'DISCORD_TOKEN is required but was not set',
            'DISCORD_CLIENT_ID is required but was not set',
        ]);
    });

    test('reports only the missing one when the other is set', () => {
        const { errors } = validateBotEnv({ DISCORD_TOKEN: 'abc' });

        expect(errors).toEqual(['DISCORD_CLIENT_ID is required but was not set']);
    });

    test('accepts both when set', () => {
        const { config, errors } = validateBotEnv({
            DISCORD_TOKEN: 'abc',
            DISCORD_CLIENT_ID: 'def',
        });

        expect(errors).toEqual([]);
        expect(config).toEqual({ DISCORD_TOKEN: 'abc', DISCORD_CLIENT_ID: 'def' });
    });
});
