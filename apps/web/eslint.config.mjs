import { baseConfig } from '@rentuz/config/eslint.base';

export default [
  ...baseConfig(),
  { ignores: ['.next/**', 'node_modules/**'] },
  {
    // Web-specific: disable Next/react plugins we don't load, and the
    // consistent-type-imports rule that breaks DI value imports (mirrors
    // the api rule; the web has no DI today but stays consistent).
    rules: {
      'consistent-type-imports': 'off',
    },
  },
];
