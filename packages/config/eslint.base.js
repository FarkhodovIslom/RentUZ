import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * Shared ESLint 9 flat-config fragments. Apps spread this and add their own ignores/rules.
 * `ignores` in a bare object acts as global ignores for the whole config.
 */
export function baseConfig() {
  return [
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    {
      ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/generated/**', '**/.turbo/**'],
    },
    {
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    },
  ];
}
