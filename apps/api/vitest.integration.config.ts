import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/rentuz?schema=public&search_path=public,extensions',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'phase0-dev-secret-change-me',
      AUTH_OTP_DEV_MODE: 'true',
      NODE_ENV: 'test',
      DISABLE_THROTTLE: 'true',
    },
  },
});
