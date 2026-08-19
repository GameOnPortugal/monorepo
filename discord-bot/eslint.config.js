// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**', 'prisma/generated/**', 'coverage/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        linterOptions: {
            // Catches `eslint-disable` comments for rules that aren't actually
            // enabled — several were left over from a linter this repo never had.
            reportUnusedDisableDirectives: 'error',
        },
        rules: {
            // Pragmatic, not maximalist: don't force a refactor of the existing
            // codebase, just keep new code honest.
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-empty-object-type': 'warn',
            '@typescript-eslint/no-empty-interface': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            'no-empty': 'warn',
            'no-case-declarations': 'off',
        },
    },
    eslintConfigPrettier,
);
