import { baseConfig } from '@rentuz/config/eslint.base';

export default [
  ...baseConfig(),
  { ignores: ['dist/**', 'src/generated/**', 'generated/**'] },
];
