import { baseConfig } from '@rentuz/config/eslint.base';

// The API relies on `emitDecoratorMetadata`: Nest resolves constructor
// injection from runtime type metadata, so DI-injected services MUST be
// value imports even when a file only references them as types.
// `consistent-type-imports` therefore has to stay off here.
export default [
  ...baseConfig(),
  {
    ignores: ['dist/**', 'src/generated/**', 'generated/**'],
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
